import { handleApiRequest } from "../../lib/api-handler.mjs";

export default async (req, context) => handleApiRequest(req, context);

export const config = {
  path: "/api/*",
};
