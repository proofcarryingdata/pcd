import { expect } from "chai";
import { Feed, FeedSubscriptionManager } from "../src/SubscriptionManager";
import { MockFeedApi } from "./MockFeedApi";

describe("Subscription Manager", async function () {
  const mockFeedApi = new MockFeedApi();

  it("keeping track of providers should work", async function () {
    const manager = new FeedSubscriptionManager(mockFeedApi);

    const providerUrl = "test url";
    manager.addProvider(providerUrl);
    expect(manager.getProviders().length).to.eq(1);
    expect(manager.getProviders().map((p) => p.providerUrl)).to.deep.eq([
      providerUrl
    ]);
    manager.removeProvider(providerUrl);
    expect(manager.getProviders().length).to.eq(0);
  });

  it("keeping track of subscriptions should work", async function () {
    const manager = new FeedSubscriptionManager(mockFeedApi);

    const providerUrl = "test url";
    manager.addProvider(providerUrl);

    const feed: Feed = {
      description: "description",
      id: "1",
      name: "test feed",
      permissions: [],
      inputPCDType: undefined,
      partialArgs: undefined
    };

    manager.subscribe(providerUrl, feed, undefined);

    expect(manager.getActiveSubscriptions().length).to.eq(1);
    const sub = manager.getSubscription(providerUrl, feed.id);

    expect(sub?.credential).to.eq(undefined);
    expect(sub?.providerUrl).to.eq(providerUrl);
    expect(sub?.subscribedTimestamp).to.not.eq(undefined);

    expect(sub?.feed.description).to.eq(feed.description);
    expect(sub?.feed.id).to.eq(feed.id);
    expect(sub?.feed.name).to.eq(feed.name);
    expect(sub?.feed.permissions).to.deep.eq(feed.permissions);
    expect(sub?.feed.inputPCDType).to.eq(feed.inputPCDType);
    expect(sub?.feed.partialArgs).to.deep.eq(feed.partialArgs);

    const subs = manager.getSubscriptionsForProvider(providerUrl);
    expect(subs).to.deep.eq([sub]);

    manager.unsubscribe(providerUrl, feed.id);
    expect(manager.getActiveSubscriptions().length).to.eq(0);
    expect(manager.getProviders().length).to.eq(0);
  });

  it("serialization and deserialization should work", async function () {
    const manager = new FeedSubscriptionManager(mockFeedApi);

    const providerUrl = "test url";
    manager.addProvider(providerUrl);

    const feed: Feed = {
      description: "description",
      id: "1",
      name: "test feed",
      permissions: [],
      inputPCDType: undefined,
      partialArgs: undefined
    };

    manager.subscribe(providerUrl, feed, undefined);

    const serialized = manager.serialize();
    const deserialized = FeedSubscriptionManager.deserialize(
      mockFeedApi,
      serialized
    );

    expect(manager.getProviders()).to.deep.eq(deserialized.getProviders());
    expect(manager.getActiveSubscriptions().length).to.eq(
      deserialized.getActiveSubscriptions().length
    );

    for (let i = 0; i < manager.getActiveSubscriptions().length; i++) {
      const l = manager.getActiveSubscriptions()[0];
      const r = deserialized.getActiveSubscriptions()[0];

      expect(l.feed.description).to.eq(r.feed.description);
      expect(l.feed.id).to.eq(r.feed.id);
      expect(l.feed.name).to.eq(r.feed.name);
      expect(l.feed.permissions).to.deep.eq(r.feed.permissions);
      expect(l.providerUrl).to.eq(r.providerUrl);
      expect(l.subscribedTimestamp).to.eq(r.subscribedTimestamp);
      expect(l.credential).to.eq(r.credential);
    }
  });

  it("listing feeds over network should work", async () => {
    const manager = new FeedSubscriptionManager(mockFeedApi);
    const firstProviderUrl = mockFeedApi.getProviders()[0];
    const feeds = await manager.listFeeds(firstProviderUrl);
    expect(feeds.length).to.eq(1);
  });

  it("polling feeds over network should work", async () => {
    const manager = new FeedSubscriptionManager(mockFeedApi);
    const firstProviderUrl = mockFeedApi.getProviders()[0];
    const feeds = await manager.listFeeds(firstProviderUrl);
    const firstFeed = feeds[0];

    manager.subscribe(firstProviderUrl, firstFeed);
    const actions = await manager.pollSubscriptions();
    expect(actions.length).to.eq(1);
  });
});
