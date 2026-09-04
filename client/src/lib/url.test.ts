import { describe, expect, it } from "vitest";
import { domainOf, normalizeUrl } from "./url";

describe("normalizeUrl", () => {
  it("collapses links that open the same page", () => {
    const canonical = normalizeUrl("https://example.com/article");
    expect(normalizeUrl("https://www.example.com/article")).toBe(canonical);
    expect(normalizeUrl("http://example.com/article")).toBe(canonical);
    expect(normalizeUrl("https://EXAMPLE.com/article")).toBe(canonical);
    expect(normalizeUrl("https://example.com/article/")).toBe(canonical);
    expect(normalizeUrl("https://example.com/article#section-2")).toBe(canonical);
    expect(normalizeUrl("https://example.com:443/article")).toBe(canonical);
  });

  it("drops tracking parameters but keeps meaningful ones", () => {
    expect(normalizeUrl("https://example.com/a?utm_source=twitter&utm_medium=social")).toBe("example.com/a");
    expect(normalizeUrl("https://example.com/a?fbclid=xyz&gclid=abc")).toBe("example.com/a");
    expect(normalizeUrl("https://example.com/search?q=recall")).toBe("example.com/search?q=recall");
    expect(normalizeUrl("https://example.com/a?id=7&utm_campaign=x")).toBe("example.com/a?id=7");
  });

  it("orders parameters so their order does not create a second entry", () => {
    expect(normalizeUrl("https://example.com/a?b=2&a=1")).toBe(normalizeUrl("https://example.com/a?a=1&b=2"));
  });

  it("keeps distinct pages distinct", () => {
    expect(normalizeUrl("https://example.com/a")).not.toBe(normalizeUrl("https://example.com/b"));
    expect(normalizeUrl("https://example.com/")).toBe("example.com/");
  });

  it("returns an empty key for anything it cannot key on", () => {
    expect(normalizeUrl("chrome://extensions")).toBe("");
    expect(normalizeUrl("about:blank")).toBe("");
    expect(normalizeUrl("not a url")).toBe("");
    expect(normalizeUrl(undefined)).toBe("");
    expect(normalizeUrl("")).toBe("");
  });
});

describe("domainOf", () => {
  it("strips the scheme and www", () => {
    expect(domainOf("https://www.example.com/a/b")).toBe("example.com");
    expect(domainOf("garbage")).toBe("");
  });
});
