import { test } from "node:test";
import assert from "node:assert/strict";
import { checkUrl, isPrivateAddress, isPublicHost } from "./guard.ts";

test("adresses internes bloquées (SSRF)", () => {
  for (const a of ["127.0.0.1", "10.1.2.3", "172.20.0.5", "192.168.1.1", "169.254.169.254", "100.64.1.1", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
    assert.equal(isPrivateAddress(a), true, a);
  }
  for (const a of ["8.8.8.8", "151.101.1.1", "2a00:1450:4007::1"]) assert.equal(isPrivateAddress(a), false, a);
});

test("URLs refusées : protocole, port, identifiants, hôtes locaux", async () => {
  assert.equal(checkUrl("file:///etc/passwd"), null);
  assert.equal(checkUrl("http://exemple.fr:8080/"), null);
  assert.equal(checkUrl("https://user:pass@exemple.fr/"), null);
  assert.ok(checkUrl("https://exemple.fr/chemin"));
  assert.equal(await isPublicHost("localhost"), false);
  assert.equal(await isPublicHost("169.254.169.254"), false);
  assert.equal(await isPublicHost("metadata.google.internal"), false);
});
