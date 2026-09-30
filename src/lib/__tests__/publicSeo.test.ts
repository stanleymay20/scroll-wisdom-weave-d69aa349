import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("public SEO crawl contract", () => {
  const sitemap = readFileSync("public/sitemap.xml", "utf8");

  it("submits Explore and canonical public book pages without the redirected store root", () => {
    expect(sitemap).toContain("<loc>https://scrolllibrary.org/explore</loc>");
    expect(sitemap).not.toContain("<loc>https://scrolllibrary.org/store</loc>");
    expect(sitemap).toContain(
      "<loc>https://scrolllibrary.org/store/what-did-the-black-man-do-wrong</loc>",
    );
  });

  it("does not submit noindex auth pages", () => {
    expect(sitemap).not.toContain("<loc>https://scrolllibrary.org/auth</loc>");
  });
});
