/* eslint-disable no-restricted-globals */
import { MockXhr, newMockXhr } from "mock-xmlhttprequest";
import { match } from "path-to-regexp";
import { JsonResponse } from "./JsonResponse";
import { Request } from "./Request";
import { arraysAreEquivalent } from "./arraysAreEquivalent";
import { defaultResponseHeaders } from "./defaultResponseHeaders";
import { getResponseHeaderMap } from "./getResponseHeaderMap";
import { setRequestHeaders } from "./setRequestHeaders";
import { getNormalizedUrl } from "./url";
import { schema, validate } from "./validator";

// declare global {
//   var realFetch: typeof fetch;
//   var realXMLHttpRequest: typeof XMLHttpRequest;
//   var fetch: typeof fetch;
// }

const global =
  // eslint-disable-next-line no-undef
  (typeof globalThis !== "undefined" && globalThis) ||
  (typeof self !== "undefined" && self) ||
  (typeof global !== "undefined" && global) ||
  {};

// Extract types since mock-xmlhttprequest doesn't export them.
type OnSendCallback = Exclude<(typeof MockXhr)["onSend"], undefined>;
type MockXhrRequest = Parameters<OnSendCallback>[0];

export class Faker {
  constructor() {
    this.LocalMockXhr = newMockXhr();
    this.LocalMockXhr.onSend = this.mockXhrRequest;

    global.realFetch = global.fetch;
    global.realXMLHttpRequest = global.XMLHttpRequest;

    global.fetch = this.mockFetch;
    global.XMLHttpRequest = this.LocalMockXhr;

    this.requestMap = {};
    this.ignoreQueryParams = false;
  }

  private ignoreQueryParams: boolean;
  private LocalMockXhr: typeof MockXhr;
  private requestMap: Record<string, any>;

  getRequests = () => Object.values(this.requestMap);

  getKey = (url = "", searchParamKeys = [], method = "GET") =>
    url && method
      ? [url, ...searchParamKeys, method.toLowerCase()].join("_")
      : "";

  makeInitialRequestMap = (requests: Array<any>) => {
    if (!requests || !Array.isArray(requests)) {
      return;
    }

    this.restore();
    requests.forEach((request) => {
      this.add(request);
    });
  };

  setIgnoreQueryParams = (value) => {
    this.ignoreQueryParams = value;
  };

  add = (request: Request) => {
    const { path, searchParamKeys } = getNormalizedUrl(request.url);
    const key = this.getKey(path, searchParamKeys, request.method);
    const errors = validate(request, schema);

    if (errors && errors.length) {
      this.requestMap[key] = {
        errors,
        originalRequest: request,
      };
      return;
    }

    this.requestMap[key] = {
      ...request,
      path: path,
      searchParamKeys: searchParamKeys,
      method: request.method || "GET",
      status: request.status || 200,
      delay: request.delay || 0,
      skip: false,
      errors: [],
    };
  };

  update = (item, fieldKey, value) => {
    const { url, method } = item;
    const { path, searchParamKeys } = getNormalizedUrl(url);
    const itemKey = this.getKey(path, searchParamKeys, method);

    if (
      // eslint-disable-next-line no-prototype-builtins
      this.requestMap.hasOwnProperty(itemKey) &&
      // eslint-disable-next-line no-prototype-builtins
      this.requestMap[itemKey].hasOwnProperty(fieldKey)
    ) {
      this.requestMap[itemKey][fieldKey] = value;
    }
  };

  private matchMock = (url: string, method = "GET") => {
    const { path, searchParamKeys } = getNormalizedUrl(url);

    for (let key in this.requestMap) {
      const { url: requestUrl, method: requestMethod } = this.requestMap[key];
      const { path: requestPath, searchParamKeys: requestSearchKeys } =
        getNormalizedUrl(requestUrl);
      if (
        match(requestPath)(path) &&
        method == requestMethod &&
        this.matchQueryParams(searchParamKeys, requestSearchKeys) &&
        !this.requestMap[key].skip
      ) {
        return this.requestMap[key];
      }
    }

    return null;
  };

  matchQueryParams = (searchParams, requestSearchParams) => {
    return (
      this.ignoreQueryParams ||
      arraysAreEquivalent(searchParams, requestSearchParams)
    );
  };

  mockFetch = (input, options) => {
    const request = new Request(input, options);
    const { url, method } = request;
    const matched = this.matchMock(url, method);

    if (!matched) {
      // eslint-disable-next-line no-restricted-globals
      return global.realFetch(input, options);
    }

    const { response, status, delay = 0 } = matched;

    let mockResponseSent = false;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (typeof response === "function") {
          resolve(new JsonResponse(status, response(request)));
        } else {
          resolve(new JsonResponse(status, response));
        }

        mockResponseSent = true;
      }, +delay);

      request.signal?.addEventListener("abort", () => {
        if (mockResponseSent) {
          return;
        }

        timeoutId && clearTimeout(timeoutId);

        const error = new Error(request.signal.reason);

        error.name = "AbortError";

        reject(error);
      });
    });
  };

  private mockXhrRequest: OnSendCallback = (request: MockXhrRequest) => {
    const { method, url, body } = request;
    const matched = this.matchMock(url, method);

    if (matched) {
      const { response, status, delay = 0 } = matched;
      setTimeout(() => {
        if (typeof response === "function") {
          const data = response(new Request(url, { method, body }));
          request.respond(
            +status,
            defaultResponseHeaders,
            JSON.stringify(data)
          );
        } else {
          request.respond(
            +status,
            defaultResponseHeaders,
            JSON.stringify(response)
          );
        }
      }, +delay);
    } else {
      const RealXMLHTTPRequest = global.realXMLHttpRequest;
      const realXhr = new RealXMLHTTPRequest();
      const fakeXhr = request._responseReceiver;

      realXhr.open(method, url);

      realXhr.timeout = fakeXhr.timeout;
      realXhr.withCredentials = fakeXhr.withCredentials;
      this.transferEventListeners(fakeXhr, realXhr);
      setRequestHeaders(
        realXhr,
        new Map(Object.entries(request.requestHeaders.getHash()))
      );

      realXhr.addEventListener("readystatechange", () => {
        if (realXhr.readyState === XMLHttpRequest.DONE) {
          request.respond(
            realXhr.status,
            getResponseHeaderMap(realXhr),
            realXhr.responseText,
            realXhr.statusText
          );
        }
      });

      realXhr.addEventListener("abort", () => request.abort());
      realXhr.addEventListener("error", () => request.setNetworkError());
      realXhr.addEventListener("timeout", () => request.setRequestTimeout());

      realXhr.send(body);
    }
  };

  transferEventListeners(fakeXhr, realXhr) {
    fakeXhr._listeners.forEach((handlers, eventName) => {
      if (eventName === "loadstart") {
        // We can't transfer loadstart because it fires as soon as the user calls xhr.start() and
        // before this method is called, so to avoid calling it twice, we refrain from transferring it.
        return;
      }

      handlers.forEach(
        ({ isEventHandlerProperty, listener, useCapture, once }) => {
          if (isEventHandlerProperty) {
            realXhr[`on${eventName}`] = listener;
          } else {
            realXhr.addEventListener(eventName, listener, {
              once,
              capture: useCapture,
            });
          }
        }
      );
    });

    fakeXhr._listeners.clear();
  }

  restore = () => {
    this.requestMap = {};
    this.ignoreQueryParams = false;
  };
}

export default new Faker();
