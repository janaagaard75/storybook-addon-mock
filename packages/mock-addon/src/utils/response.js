import "whatwg-fetch";
import { defaultResponseHeaders } from "./headers";
import { statusTexts } from "./statusTexts";

export function CustomResponse(url, status, responseText) {
  const text =
    typeof responseText === "string"
      ? responseText
      : JSON.stringify(responseText);

  return new Response(text, {
    ok: ((status / 100) | 0) === 2, // 200-299
    status: status,
    statusText: statusTexts[status.toString()],
    headers: new Headers({
      ...defaultResponseHeaders,
    }),
    url,
  });
}
