import { Faker } from './faker';
import { newMockXhr } from 'mock-xmlhttprequest';

function setRealRequestInterceptors(realRequestInterceptor) {
    global.XMLHttpRequest = newMockXhr();
    global.XMLHttpRequest.onSend = realRequestInterceptor;
    return () => {
        delete global.XMLHttpRequest;
    };
}

function setupFaker(mockFakerRequests) {
    const faker = new Faker();
    if (mockFakerRequests) {
        faker.makeInitialRequestMap(mockFakerRequests);
    }
    return [faker, () => faker.restore()];
}

function setupMocks(mockFakerRequests, realRequestInterceptor) {
    let disposers = [];
    if (realRequestInterceptor) {
        disposers.push(setRealRequestInterceptors(realRequestInterceptor));
    }

    const [faker, fakerDisposer] = setupFaker(mockFakerRequests);
    disposers.push(fakerDisposer);

    return {
        faker,
        dispose: () => {
            disposers.forEach((fn) => fn());
            disposers = [];
        },
    };
}

async function getEntangledFakeAndRealXHRs(options) {
    let realXHR = {};
    let setHeaderSpy = undefined;
    const originalXHR = global.realXMLHttpRequest;
    global.realXMLHttpRequest = new Proxy(originalXHR, {
        construct(target, args, newTarget) {
            realXHR = Reflect.construct(target, args, newTarget);
            setHeaderSpy = jest.spyOn(realXHR, 'setRequestHeader');
            return realXHR;
        },
    });
    const fakeXhr = new XMLHttpRequest();
    const fakeXhrFinished = new Promise((resolve) =>
        fakeXhr.addEventListener('loadend', resolve)
    );

    options.events?.forEach((event) => {
        const mockFn = jest.fn().mockName(event.name);
        event.listener = mockFn;
        if (event.isPropertyHandler) {
            fakeXhr[`on${event.name}`] = mockFn;
        } else {
            fakeXhr.addEventListener(event.name, mockFn);
        }
    });

    fakeXhr.open(options.method, options.url);
    fakeXhr.timeout = options.timeout;
    fakeXhr.withCredentials = options.withCredentials;

    if (options.headers) {
        Object.entries(options.headers).forEach(([header, value]) =>
            fakeXhr.setRequestHeader(header, value)
        );
    }

    fakeXhr.send(JSON.stringify(options.body));

    await fakeXhrFinished;

    return {
        fakeXhr,
        realXHR,
        setHeaderSpy,
        events: options.events,
        dispose() {
            global.realXMLHttpRequest = originalXHR;
        },
    };
}

function assertEventListeners(realXHR, events) {
    events.forEach((event) => {
        if (event.isPropertyHandler) {
            const eventName = `on${event.name}`;
            if (!event.shouldTransfer) {
                expect(realXHR[eventName]).toBeFalsy();
            } else {
                expect(realXHR[eventName]).toBe(event.listener);
            }
        }

        if (event.shouldBeCalledTimes === -1) {
            expect(event.listener).toHaveBeenCalled();
        } else {
            expect(event.listener).toHaveBeenCalledTimes(
                event.shouldBeCalledTimes
            );
        }
    });
}

describe('Faker', () => {
    describe('getKey', () => {
        it('should return empty string if url and method are empty strings', () => {
            const { faker, dispose } = setupMocks();
            const actual = faker.getKey('', [], '');
            expect(actual).toEqual('');
            dispose();
        });

        it('should return a string binding url and method with underscore if searchParamKeys is empty', () => {
            const { faker, dispose } = setupMocks();
            const actual = faker.getKey('google.com', [], 'GET');
            expect(actual).toEqual('google.com_get');
            dispose();
        });

        it('should return a string binding url, search params keys, and method with underscore', () => {
            const { faker, dispose } = setupMocks();
            const actual = faker.getKey('google.com', ['all', 'only'], 'GET');
            expect(actual).toEqual('google.com_all_only_get');
            dispose();
        });
    });

    describe('makeInitialRequestMap', () => {
        beforeEach(() => {
            jest.resetAllMocks();
        });

        it('should not call add method if request is empty', () => {
            const { faker, dispose } = setupMocks();
            const addSpy = jest.spyOn(faker, 'add');
            faker.makeInitialRequestMap();
            expect(addSpy).toHaveBeenCalledTimes(0);
            dispose();
        });

        it('should not call add method if request is not an array', () => {
            const { faker, dispose } = setupMocks();
            const addSpy = jest.spyOn(faker, 'add');
            faker.makeInitialRequestMap({});
            expect(addSpy).toHaveBeenCalledTimes(0);
            dispose();
        });

        it('should call add method if request is an array', () => {
            const { faker, dispose } = setupMocks();
            const addSpy = jest.spyOn(faker, 'add');
            const requests = [
                { url: 'http://request.com', method: 'GET' },
                { url: 'http://request1.com', method: 'POST' },
            ];
            faker.makeInitialRequestMap(requests);
            expect(addSpy).toHaveBeenCalledTimes(2);
            dispose();
        });
    });

    describe('matchMock', () => {
        const requests = [
            {
                url: 'http://request.com',
                method: 'GET',
                status: 200,
                response: {},
                delay: 0,
            },
            {
                url: 'http://request1.com/1',
                method: 'PUT',
                status: 201,
                response: {},
                delay: 0,
            },
            {
                url: 'http://request2.com/:id',
                method: 'POST',
                status: 404,
                response: {},
                delay: 0,
            },
        ];

        it('should return request if url matches', () => {
            const { faker, dispose } = setupMocks(requests);
            const actual = faker.matchMock('http://request.com', 'GET');
            expect(actual.url).toEqual(requests[0].url);
            expect(actual.method).toEqual(requests[0].method);
            expect(actual.skip).toEqual(false);
            dispose();
        });

        it('should return null if url does not match', () => {
            const { faker, dispose } = setupMocks(requests);
            const actual = faker.matchMock('http://notmatched.com', 'GET');
            expect(actual).toBeNull();
            dispose();
        });

        it('should return request if url matches with the regex', () => {
            const { faker, dispose } = setupMocks(requests);
            const actual = faker.matchMock('http://request2.com/3', 'POST');
            expect(actual.url).toEqual(requests[2].url);
            expect(actual.method).toEqual(requests[2].method);
            expect(actual.skip).toEqual(false);
            dispose();
        });
    });

    describe('restore', () => {
        const requests = [
            {
                url: 'http://request.com',
                method: 'GET',
                status: 200,
                response: {},
            },
            {
                url: 'http://request1.com/1',
                method: 'PUT',
                status: 201,
                response: {},
            },
            {
                url: 'http://request2.com/:id',
                method: 'POST',
                status: 404,
                response: {},
            },
        ];

        it('should clear the request map', () => {
            const { faker, dispose } = setupMocks(requests);
            expect(faker.getRequests().length).toEqual(3);
            faker.restore();
            expect(faker.getRequests().length).toEqual(0);
            dispose();
        });
    });

    describe('unmocked', () => {
        const requests = [
            {
                url: 'http://request.com',
                method: 'GET',
                status: 200,
                response: {},
            },
        ];

        it('should reflect with 200', async () => {
            // Data
            const response = { data: 'mock data' };
            const responseJSON = JSON.stringify(response);

            const options = {
                method: 'GET',
                url: 'http://foo.bar',
                timeout: 2000,
                withCredentials: true,
                events: [
                    {
                        name: 'abort',
                        isPropertyHandler: true,
                        shouldBeCalledTimes: 0,
                        shouldTransfer: true,
                    },
                    {
                        name: 'error',
                        isPropertyHandler: true,
                        shouldBeCalledTimes: 0,
                        shouldTransfer: true,
                    },
                    {
                        name: 'load',
                        isPropertyHandler: true,
                        shouldBeCalledTimes: 1,
                        shouldTransfer: true,
                    },
                    {
                        name: 'loadend',
                        isPropertyHandler: true,
                        shouldBeCalledTimes: 1,
                        shouldTransfer: true,
                    },
                    {
                        name: 'loadstart',
                        isPropertyHandler: true,
                        shouldBeCalledTimes: 1,
                        shouldTransfer: false,
                    },
                    {
                        name: 'progress',
                        isPropertyHandler: true,
                        shouldBeCalledTimes: -1,
                        shouldTransfer: true,
                    },
                    {
                        name: 'readystatechange',
                        isPropertyHandler: true,
                        shouldBeCalledTimes: 4,
                        shouldTransfer: true,
                    },
                    {
                        name: 'timeout',
                        isPropertyHandler: true,
                        shouldBeCalledTimes: 0,
                        shouldTransfer: true,
                    },
                    {
                        name: 'readystatechange',
                        isPropertyHandler: false,
                        shouldBeCalledTimes: 4,
                        shouldTransfer: true,
                    },
                ],
                headers: {
                    foo: 'bar',
                },
            };

            // Setup
            const { dispose } = setupMocks(requests, (request) => {
                request.respond(
                    200,
                    { 'Content-Type': 'application/json' },
                    responseJSON
                );
            });

            const {
                fakeXhr,
                realXHR,
                setHeaderSpy,
                events,
                dispose: disposeFake,
            } = await getEntangledFakeAndRealXHRs(options);

            // Assert
            expect(realXHR.timeout).toEqual(2000);
            expect(realXHR.withCredentials).toEqual(true);

            assertEventListeners(realXHR, events);

            expect(setHeaderSpy).toHaveBeenCalledWith('foo', 'bar');
            expect(fakeXhr.status).toEqual(200);
            expect(fakeXhr.responseText).toEqual(responseJSON);
            expect(fakeXhr.getResponseHeader('Content-Type')).toEqual(
                'application/json'
            );
            expect(fakeXhr.statusText).toEqual('OK');
            expect(fakeXhr.readyState).toEqual(fakeXhr.DONE);
            expect(
                events.find(
                    (e) =>
                        e.isPropertyHandler === false &&
                        e.name === 'readystatechange'
                ).listener
            ).toHaveBeenCalledTimes(4);

            // Teardown

            dispose();
            disposeFake();
        });

        it('should reflect with 202', async () => {
            // Data
            const response = { response: 'ok' };
            const responseJSON = JSON.stringify(response);

            const options = {
                method: 'POST',
                url: 'http://foo.com/api/user/1',
                body: {
                    name: 'yossi',
                    age: '30',
                },
                timeout: 100,
                withCredentials: false,
                events: [
                    {
                        name: 'load',
                        isPropertyHandler: true,
                        shouldBeCalledTimes: 1,
                        shouldTransfer: true,
                    },
                    {
                        name: 'readystatechange',
                        isPropertyHandler: false,
                        shouldBeCalledTimes: 4,
                        shouldTransfer: true,
                    },
                ],
                headers: {
                    foo: 'bar',
                },
            };

            // Setup
            const { dispose } = setupMocks(requests, (request) => {
                request.respond(
                    202,
                    { 'Content-Type': 'application/json' },
                    responseJSON
                );
            });

            const {
                fakeXhr,
                realXHR,
                setHeaderSpy,
                events,
                dispose: disposeFake,
            } = await getEntangledFakeAndRealXHRs(options);

            // Assert
            expect(realXHR.timeout).toEqual(100);
            expect(realXHR.withCredentials).toEqual(false);

            assertEventListeners(realXHR, events);

            expect(setHeaderSpy).toHaveBeenCalledWith('foo', 'bar');
            expect(fakeXhr.status).toEqual(202);
            expect(fakeXhr.responseText).toEqual(responseJSON);
            expect(fakeXhr.getResponseHeader('Content-Type')).toEqual(
                'application/json'
            );
            expect(fakeXhr.statusText).toEqual('Accepted');
            expect(fakeXhr.readyState).toEqual(fakeXhr.DONE);
            expect(
                events.find(
                    (e) =>
                        e.isPropertyHandler === false &&
                        e.name === 'readystatechange'
                ).listener
            ).toHaveBeenCalledTimes(4);

            // Teardown

            dispose();
            disposeFake();
        });

        it('should reflect with 301', async () => {
            // Data

            const options = {
                method: 'GET',
                url: 'http://foo.com/',
                timeout: 100,
                withCredentials: true,
                events: [
                    {
                        name: 'readystatechange',
                        isPropertyHandler: false,
                        shouldBeCalledTimes: 4,
                        shouldTransfer: true,
                    },
                ],
                headers: {
                    foo: 'bar',
                },
            };

            // Setup
            const { dispose } = setupMocks(requests, (request) => {
                request.respond(301, { Location: 'http://bar.com' }, '');
            });

            const {
                fakeXhr,
                realXHR,
                setHeaderSpy,
                events,
                dispose: disposeFake,
            } = await getEntangledFakeAndRealXHRs(options);

            // Assert
            expect(realXHR.timeout).toEqual(100);
            expect(realXHR.withCredentials).toEqual(true);

            assertEventListeners(realXHR, events);

            expect(setHeaderSpy).toHaveBeenCalledWith('foo', 'bar');
            expect(fakeXhr.status).toEqual(301);
            expect(fakeXhr.responseText).toEqual('');
            expect(fakeXhr.getResponseHeader('Location')).toEqual(
                'http://bar.com'
            );
            expect(fakeXhr.statusText).toEqual('Moved Permanently');
            expect(fakeXhr.readyState).toEqual(fakeXhr.DONE);
            expect(
                events.find(
                    (e) =>
                        e.isPropertyHandler === false &&
                        e.name === 'readystatechange'
                ).listener
            ).toHaveBeenCalledTimes(4);

            // Teardown

            dispose();
            disposeFake();
        });

        it('should reflect with 404', async () => {
            // Data

            const options = {
                method: 'GET',
                url: 'http://foo.com/',
                timeout: 100,
                withCredentials: true,
            };

            // Setup
            const { dispose } = setupMocks(requests, (request) => {
                request.respond(404, {}, '');
            });

            const {
                fakeXhr,
                realXHR,
                dispose: disposeFake,
            } = await getEntangledFakeAndRealXHRs(options);

            // Assert
            expect(realXHR.timeout).toEqual(100);
            expect(realXHR.withCredentials).toEqual(true);

            expect(fakeXhr.status).toEqual(404);
            expect(fakeXhr.responseText).toEqual('');
            expect(fakeXhr.statusText).toEqual('Not Found');
            expect(fakeXhr.readyState).toEqual(fakeXhr.DONE);

            // Teardown
            dispose();
            disposeFake();
        });

        it('should reflect with 500', async () => {
            // Data

            const options = {
                method: 'GET',
                url: 'http://foo.com/',
                timeout: 100,
                withCredentials: true,
            };

            // Setup
            const { dispose } = setupMocks(requests, (request) => {
                request.respond(500, {}, '');
            });

            const {
                fakeXhr,
                realXHR,
                dispose: disposeFake,
            } = await getEntangledFakeAndRealXHRs(options);

            // Assert
            expect(realXHR.timeout).toEqual(100);
            expect(realXHR.withCredentials).toEqual(true);

            expect(fakeXhr.status).toEqual(500);
            expect(fakeXhr.responseText).toEqual('');
            expect(fakeXhr.statusText).toEqual('Internal Server Error');
            expect(fakeXhr.readyState).toEqual(fakeXhr.DONE);

            // Teardown
            dispose();
            disposeFake();
        });
    });
});
