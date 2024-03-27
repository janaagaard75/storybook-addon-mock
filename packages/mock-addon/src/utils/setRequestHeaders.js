export function setRequestHeaders(xhr, headers) {
  for (let [key, value] of headers) {
    xhr.setRequestHeader(key, value);
  }
}
