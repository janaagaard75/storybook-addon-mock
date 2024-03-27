import "whatwg-fetch";
import { defaultResponseHeaders } from "./headers";
import statusTextMap from "./statusMap";

export function CustomResponse(url, status, responseText) {
  const text =
    typeof responseText === "string"
      ? responseText
      : JSON.stringify(responseText);

  return new Response(text, {
    ok: ((status / 100) | 0) === 2, // 200-299
    status: status,
    statusText: statusTextMap[status.toString()],
    headers: new Headers({
      ...defaultResponseHeaders,
    }),
    url,
  });
}
