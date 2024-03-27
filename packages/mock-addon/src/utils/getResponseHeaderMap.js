export function getResponseHeaderMap(xhr) {
  const headers = {};
  xhr
    .getAllResponseHeaders()
    .trim()
    .split(/[\r\n]+/)
    .map((value) => value.split(/: /))
    .forEach((keyValue) => {
      if (keyValue[0]) {
        headers[keyValue[0].trim()] = keyValue[1] && keyValue[1].trim();
      }
    });
  return headers;
}
