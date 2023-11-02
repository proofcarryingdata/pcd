import { rest } from "msw";
import { SetupServer, setupServer } from "msw/node";
import { DevconnectPretixDataMocker } from "./devconnectPretixDataMocker";

export function getDevconnectMockPretixAPIServer(
  orgs: IterableIterator<string>,
  mocker: DevconnectPretixDataMocker
): SetupServer {
  const handlers = [];

  for (const orgUrl of orgs) {
    handlers.push(
      rest.get(orgUrl + "/events", (req, res, ctx) => {
        const org = mocker.getOrgByUrl(orgUrl);
        return res(
          ctx.json({ results: [...org.eventByEventID.values()], next: null })
        );
      })
    );

    handlers.push(
      rest.get(orgUrl + "/events/:event", (req, res, ctx) => {
        const org = mocker.getOrgByUrl(orgUrl);
        const event = org.eventByEventID.get(req.params.event as string);
        if (!event) {
          return res(ctx.status(404));
        }
        return res(ctx.json(event));
      })
    );

    handlers.push(
      rest.get(orgUrl + "/events/:event/items", (req, res, ctx) => {
        const org = mocker.getOrgByUrl(orgUrl);
        const items = org.itemsByEventID.get(req.params.event as string) ?? [];
        return res(ctx.json({ results: items, next: null }));
      })
    );

    handlers.push(
      rest.get(orgUrl + "/events/:event/orders", (req, res, ctx) => {
        const org = mocker.getOrgByUrl(orgUrl);
        const orders =
          org.ordersByEventID.get(req.params.event as string) ?? [];
        return res(ctx.json({ results: orders, next: null }));
      })
    );

    handlers.push(
      rest.get(orgUrl + "/events/:event/categories", (req, res, ctx) => {
        const org = mocker.getOrgByUrl(orgUrl);
        const categories =
          org.categoriesByEventId.get(req.params.event as string) ?? [];
        return res(ctx.json({ results: categories, next: null }));
      })
    );

    handlers.push(
      rest.get(orgUrl + "/events/:event/settings", (req, res, ctx) => {
        const org = mocker.getOrgByUrl(orgUrl);
        const settings = org.settingsByEventID.get(req.params.event as string);
        return res(ctx.json(settings));
      })
    );

    handlers.push(
      rest.get(orgUrl + "/events/:event/checkinlists", (req, res, ctx) => {
        return res(
          ctx.json({ results: [{ id: 1, name: "Test" }], next: null })
        );
      })
    );

    handlers.push(
      rest.post(orgUrl + "/checkinrpc/redeem", async (req, res, ctx) => {
        const body = new Map(Object.entries(await req.json()));
        if (
          !body.has("secret") ||
          !body.has("lists") ||
          typeof body.get("secret") !== "string" ||
          !Array.isArray(body.get("lists"))
        ) {
          return res(ctx.status(400), ctx.json({}));
        }

        return res(ctx.json({ status: "ok" }));
      })
    );
  }

  const server = setupServer(...handlers);

  return server;
}
