import { storeJsonLd } from "./config";

describe("store structured data", () => {
  test("uses only supported Store properties", () => {
    const schema = storeJsonLd();

    expect(schema["@type"]).toBe("Store");
    expect(schema).not.toHaveProperty("audience");
    expect(schema.address).toMatchObject({
      "@type": "PostalAddress",
      addressLocality: "Altamonte Springs",
      addressRegion: "FL",
      postalCode: "32714",
    });
  });
});
