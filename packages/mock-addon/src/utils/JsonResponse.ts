import "whatwg-fetch";
import { statusTexts } from "./statusTexts";

type StatusCode = keyof typeof statusTexts;

export class JsonResponse extends Response {
  public constructor(statusCode: StatusCode, responseBody: string | object) {
    super(
      typeof responseBody === "string"
        ? responseBody
        : JSON.stringify(responseBody),
      {
        status: statusCode,
        statusText: statusTexts[statusCode],
        headers: [["Content-Type", "application/json"]],
      }
    );
  }
}
