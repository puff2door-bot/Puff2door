import React from "react";
import { Link } from "react-router-dom";
import Seo from "../seo/Seo";
import { BRAND } from "../mock";
import { useCart } from "../context/CartContext";

const UPDATED = "October 25, 2026";

const Page = ({ title, seoTitle, description, path, children }) => (
  <div className="max-w-4xl mx-auto px-4 py-10 sm:py-14">
    <Seo title={seoTitle || `${title} | HD Smoke Shop`} description={description} path={path} />
    <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-1.5 text-xs text-neutral-500"><Link to="/" className="hover:text-emerald-600">Home</Link><span>/</span><span className="font-medium text-neutral-800">{title}</span></nav>
    <span className="mb-3 block h-1 w-12 rounded-full bg-emerald-600" />
    <h1 className="font-heading text-4xl uppercase tracking-tight text-neutral-900 sm:text-5xl">{title}</h1>
    <p className="mt-2 text-sm text-neutral-500">Last updated: {UPDATED}</p>
    <div className="legal-copy mt-8 space-y-7 text-sm leading-7 text-neutral-700">{children}</div>
  </div>
);

const Section = ({ title, children }) => <section><h2 className="mb-2 font-heading text-2xl uppercase tracking-wide text-neutral-900">{title}</h2><div className="space-y-3">{children}</div></section>;

export const PrivacyPolicy = () => (
  <Page title="Privacy Policy" description="How HD Smoke Shop collects, uses, protects and retains customer information." path="/privacy-policy">
    <Section title="Information we collect"><p>We collect information you provide when you create an account, place an order, contact support, join an email list, save an address, or request an alert. This can include your name, email, phone number, delivery address, date of birth, order details and support messages.</p><p>We also receive basic technical information such as browser type, device type, IP address and site activity needed for security, troubleshooting and performance.</p><p>To understand which areas our visitors come from, we record each page view with an approximate area only (city, state and, when available, ZIP code), the page viewed and the type of device. We do not store your IP address for this, do not use a cookie for it, and delete these records after 90 days.</p></Section>
    <Section title="Payments and identity checks"><p>Payments are handled by the payment method shown at checkout. HD Smoke Shop does not store full card numbers. At delivery, we record the result of the required 21+ ID check, the ID type, driver name and time. The standard workflow does not retain a complete ID image.</p></Section>
    <Section title="How we use information"><p>We use information to process and deliver orders, verify eligibility, prevent fraud, provide customer support, operate rewards, send requested order alerts, improve the site and meet legal obligations. Marketing messages are sent only where permitted and can be unsubscribed from.</p></Section>
    <Section title="Storage, sharing and choices"><p>We share only the information needed with service providers that support hosting, payments, email, analytics and delivery. Browser push subscriptions are stored only after a signed-in customer enables alerts and can be removed from the account page. We retain records only as long as needed for business, security and legal purposes.</p><p>To request access, correction or deletion of eligible personal information, contact <a className="font-semibold text-emerald-700 hover:underline" href={`mailto:${BRAND.email}`}>{BRAND.email}</a>.</p></Section>
  </Page>
);

export const TermsPage = () => (
  <Page title="Terms & Conditions" description="Terms for using HD Smoke Shop and placing a local delivery order." path="/terms">
    <Section title="Eligibility"><p>You must be at least 21 years old to use the store or purchase age-restricted products. By ordering, you confirm that your information is accurate and that you will present a valid government-issued photo ID at delivery.</p></Section>
    <Section title="Orders and availability"><p>Products, prices and inventory may change. An order is accepted only after the site confirms it. HD Smoke Shop may cancel or limit an order when inventory is unavailable, payment cannot be verified, the address is outside the delivery area, or legal and safety requirements cannot be met.</p></Section>
    <Section title="Delivery"><p>You are responsible for choosing an eligible address and being available during the selected window. The recipient must be 21+ and pass the door ID check. Orders cannot be left unattended or with anyone under 21. Estimated times can change because of traffic, weather, order volume or safety conditions.</p></Section>
    <Section title="Acceptable use"><p>Do not misuse the site, attempt unauthorized access, submit false information, interfere with checkout or use the service for unlawful resale. HD Smoke Shop may suspend access when needed to protect customers, the business or the platform.</p></Section>
    <Section title="Contact"><p>Questions about these terms can be sent to <a className="font-semibold text-emerald-700 hover:underline" href={`mailto:${BRAND.email}`}>{BRAND.email}</a>.</p></Section>
  </Page>
);

export const DeliveryPolicy = () => {
  const { delivery } = useCart();
  const area = "addresses in Altamonte Springs, ZIP 32714";
  return <Page title="Delivery Policy" description="HD Smoke Shop delivery areas, windows, age checks and failed-delivery rules." path="/delivery-policy">
    <Section title="Service area and timing"><p>Local delivery is available only to {area}. Enter the delivery ZIP before checkout for the current eligibility result. Delivery windows shown at checkout reflect current hours and capacity. {delivery.sameDayEnabled === true ? "Same-day delivery is offered only while an eligible window remains available before the cutoff." : "Choose the next available delivery window shown at checkout."}</p></Section>
    <Section title="At the door"><p>A person age 21 or older must be present with a valid government-issued photo ID. The name and age information must be readable and the ID must not be expired. Orders cannot be left unattended, in a mailbox, at a door, or with anyone under 21.</p></Section>
    <Section title="Failed delivery"><p>If the address is incorrect, no eligible adult is present, or the ID check fails, the driver returns the order to the store. Contact support for the order-specific next step. Any refund or redelivery decision follows the payment status, product condition, delivery work already performed and applicable law.</p></Section>
    <Section title="Tracking"><p>Use the Track Order page or the private order link to see the current status and delivery window. Signed-in customers may enable browser alerts from My Account when that service is configured.</p></Section>
  </Page>;
};

export const RefundPolicy = () => (
  <Page title="Refund & Return Policy" description="How HD Smoke Shop handles damaged, incorrect, cancelled and undeliverable orders." path="/refund-policy">
    <Section title="Report an order problem"><p>Contact HD Smoke Shop promptly if an item is missing, incorrect, damaged on arrival or defective. Include the order number and a clear description. Support may request photos of the product or packaging to review the issue.</p></Section>
    <Section title="Return eligibility"><p>For safety and product-integrity reasons, opened or used consumable products generally cannot be returned. Unopened items may be eligible after review. Eligibility depends on the item, condition, reason for return and applicable law.</p></Section>
    <Section title="Cancelled and failed deliveries"><p>If HD Smoke Shop cancels an order before fulfillment, any captured payment will be reviewed for refund to the original method. Orders returned because no eligible 21+ recipient was available or the ID check failed are reviewed individually; completed delivery work or processor charges may affect the refundable amount where allowed.</p></Section>
    <Section title="Refund timing"><p>Approved refunds are sent to the original payment method. The payment provider or bank controls when the credit appears. For help, email <a className="font-semibold text-emerald-700 hover:underline" href={`mailto:${BRAND.email}`}>{BRAND.email}</a>.</p></Section>
  </Page>
);

export const AgeIdPolicy = () => (
  <Page title="Age & ID Policy" seoTitle="Age & ID Policy (21+) – HD Smoke Shop" description="How HD Smoke Shop verifies age in store and at delivery. Valid government photo ID showing 21+ is required for every order." path="/age-and-id-policy">
    <Section title="21+ only"><p>HD Smoke Shop is for adults age 21 and older. Customers must pass the entry age gate, provide a valid date of birth at checkout and present acceptable identification at delivery.</p></Section>
    <Section title="Accepted identification"><p>Bring a valid, unexpired government-issued photo ID that clearly shows your photograph and date of birth, such as a state driver license, state identification card, passport or military ID.</p></Section>
    <Section title="Door verification"><p>The driver checks that the recipient is 21+, the ID appears valid and the person receiving the order matches the ID. Orders cannot be left with anyone under 21 or left unattended.</p></Section>
    <Section title="Privacy"><p>The delivery record keeps the verification result, ID type, driver name, checklist and timestamp for compliance. The standard workflow does not collect a complete ID image. See the <Link className="font-semibold text-emerald-700 hover:underline" to="/privacy-policy">Privacy Policy</Link> for more information.</p></Section>
  </Page>
);
