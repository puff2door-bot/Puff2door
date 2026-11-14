import { deliveryBannerText } from "./deliveryAreaText";

describe("deliveryBannerText", () => {
  test("lists every active delivery area from Admin", () => {
    const text = deliveryBannerText({
      mode: "selected_zips",
      areas: [
        { city: "Altamonte Springs", zips: [{ zip: "32714" }] },
        { city: "Lake Nona", zips: [{ zip: "32827" }, { zip: "32832" }] },
      ],
    });

    expect(text).toContain("Altamonte Springs and Lake Nona");
    expect(text).toBe("Walk-ins welcome · Delivery to Altamonte Springs and Lake Nona.");
  });

  test("does not claim Altamonte Springs while delivery data is loading", () => {
    expect(deliveryBannerText(null)).toBe("Walk-ins welcome · Check our current delivery area.");
  });
});
