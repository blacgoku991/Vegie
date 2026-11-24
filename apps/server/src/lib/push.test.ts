import assert from "node:assert/strict";
import { test } from "node:test";
import { buildExpoPayload } from "./push.ts";

test("push d'annonce : réveil iOS et extension de service", () => {
  const p = buildExpoPayload("ExponentPushToken[x]", { title: "t", body: "b", data: { type: "certified_call" }, channelId: "certified-calls", contentAvailable: true, mutableContent: true });
  assert.equal(p._contentAvailable, true);
  assert.equal(p.mutableContent, true);
  assert.equal(p.sound, "default");
  assert.equal(p.priority, "high");
});

test("push silencieux : ni titre, ni son", () => {
  const p = buildExpoPayload("ExponentPushToken[x]", { data: { type: "certified_call_ended", callId: "1" }, channelId: "certified-calls", contentAvailable: true, silent: true });
  assert.equal("title" in p, false);
  assert.equal("body" in p, false);
  assert.equal("sound" in p, false);
  assert.equal(p._contentAvailable, true);
  assert.equal("mutableContent" in p, false);
});

test("push ordinaire : pas de drapeaux iOS", () => {
  const p = buildExpoPayload("t", { title: "a", body: "b", data: {}, channelId: "alerts" });
  assert.equal("_contentAvailable" in p, false);
});
