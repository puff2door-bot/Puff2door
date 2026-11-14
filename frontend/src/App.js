import React, { Suspense, lazy, useEffect } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import { CartProvider } from "./context/CartContext";
import { WishlistProvider } from "./context/WishlistContext";
import { CatalogProvider } from "./context/CatalogContext";
import { Toaster } from "./components/ui/toaster";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { SalCartPop } from "./components/SalMascot";
import AgeGate from "./components/AgeGate";
import Home from "./pages/Home";
import ShopPage from "./pages/ShopPage";
import ProductDetail from "./pages/ProductDetail";
import NotFound from "./pages/NotFound";
import ChatWidget from "./components/chat/ChatWidget";
import Seo, { setJsonLd } from "./seo/Seo";
import Analytics from "./seo/Analytics";
import MobileBottomNav from "./components/MobileBottomNav";
import CompareTray from "./components/CompareTray";
import PwaExperience from "./components/PwaExperience";
import ServiceWakeBanner from "./components/ServiceWakeBanner";
import { storeJsonLd, websiteJsonLd } from "./seo/config";
import { useCart } from "./context/CartContext";
import { getThemePreview, resolveSiteTheme, SITE_THEMES, themeLabel } from "./lib/siteTheme";

// Pages other than the homepage, shop and product pages load on demand, so phones download less code up front.
// If a page's code was replaced by a newer deploy while the site was open, reload once to get the new files.
const lazyPage = (load) => lazy(() => load().catch((error) => {
  try {
    if (!sessionStorage.getItem("p2d_chunk_reload")) {
      sessionStorage.setItem("p2d_chunk_reload", "1");
      window.location.reload();
      return new Promise(() => {});
    }
  } catch (_) { /* storage unavailable */ }
  throw error;
}));
const CartPage = lazyPage(() => import("./pages/CartPage"));
const CheckoutPage = lazyPage(() => import("./pages/CheckoutPage"));
const OrderPage = lazyPage(() => import("./pages/OrderPage"));
const TrackPage = lazyPage(() => import("./pages/TrackPage"));
const AuthPage = lazyPage(() => import("./pages/AuthPage"));
const ContactPage = lazyPage(() => import("./pages/ContactPage"));
const WishlistPage = lazyPage(() => import("./pages/WishlistPage"));
const AdminLayout = lazyPage(() => import("./pages/admin/AdminLayout"));
const AdminDashboard = lazyPage(() => import("./pages/admin/AdminDashboard"));
const AdminProducts = lazyPage(() => import("./pages/admin/AdminProducts"));
const AdminOrders = lazyPage(() => import("./pages/admin/AdminOrders"));
const AdminAlerts = lazyPage(() => import("./pages/admin/AdminAlerts"));
const AdminBanners = lazyPage(() => import("./pages/admin/AdminBanners"));
const AdminEmails = lazyPage(() => import("./pages/admin/AdminEmails"));
const AdminPromos = lazyPage(() => import("./pages/admin/AdminPromos"));
const AdminSettings = lazyPage(() => import("./pages/admin/AdminSettings"));
const DeliveryAreaPage = lazyPage(() => import("./pages/DeliveryAreaPage"));
const LakeNonaDeliveryPage = lazyPage(() => import("./pages/LakeNonaDeliveryPage"));
const AdminBrands = lazyPage(() => import("./pages/admin/AdminBrands"));
const AdminCategories = lazyPage(() => import("./pages/admin/AdminCategories"));
const AdminLoyalty = lazyPage(() => import("./pages/admin/AdminLoyalty"));
const AdminChat = lazyPage(() => import("./pages/admin/AdminChat"));
const AdminOperations = lazyPage(() => import("./pages/admin/AdminOperations"));
const AdminCompliance = lazyPage(() => import("./pages/admin/AdminCompliance"));
const AdminAnalytics = lazyPage(() => import("./pages/admin/AdminAnalytics"));
const AdminAgents = lazyPage(() => import("./pages/admin/AdminAgents"));
const MissingBarcodes = lazyPage(() => import("./pages/admin/MissingBarcodes"));
const ProductDetails = lazyPage(() => import("./pages/admin/ProductDetails"));
const MissingDetails = lazyPage(() => import("./pages/admin/MissingDetails"));
const AdminReviews = lazyPage(() => import("./pages/admin/AdminReviews"));
const StoreReceipts = lazyPage(() => import("./pages/admin/StoreReceipts"));
const BusinessExpenses = lazyPage(() => import("./pages/admin/BusinessExpenses"));
const AdminDocuments = lazyPage(() => import("./pages/admin/AdminDocuments"));
const AdminCustomers = lazyPage(() => import("./pages/admin/AdminCustomers"));
const InventoryCapture = lazyPage(() => import("./pages/admin/InventoryCapture"));
const MissingPhotos = lazyPage(() => import("./pages/admin/MissingPhotos"));
const AdminClover = lazyPage(() => import("./pages/admin/AdminClover"));
const ProductRequestPage = lazyPage(() => import("./pages/ProductRequestPage"));
const ReplacementApproval = lazyPage(() => import("./pages/ReplacementApproval"));
const AdminProductRequests = lazyPage(() => import("./pages/admin/AdminProductRequests"));
const AdminPicking = lazyPage(() => import("./pages/admin/AdminPicking"));
const AdminDriver = lazyPage(() => import("./pages/admin/AdminDriver"));
const LiveShelfPage = lazyPage(() => import("./pages/LiveShelfPage"));
const BrandsPage = lazyPage(() => import("./pages/StaticPages").then((m) => ({ default: m.BrandsPage })));
const AboutPage = lazyPage(() => import("./pages/StaticPages").then((m) => ({ default: m.AboutPage })));
const FaqPage = lazyPage(() => import("./pages/StaticPages").then((m) => ({ default: m.FaqPage })));
const GuidesIndex = lazyPage(() => import("./pages/GuidesPage").then((m) => ({ default: m.GuidesIndex })));
const GuideArticle = lazyPage(() => import("./pages/GuidesPage").then((m) => ({ default: m.GuideArticle })));
const PrivacyPolicy = lazyPage(() => import("./pages/LegalPages").then((m) => ({ default: m.PrivacyPolicy })));
const TermsPage = lazyPage(() => import("./pages/LegalPages").then((m) => ({ default: m.TermsPage })));
const DeliveryPolicy = lazyPage(() => import("./pages/LegalPages").then((m) => ({ default: m.DeliveryPolicy })));
const RefundPolicy = lazyPage(() => import("./pages/LegalPages").then((m) => ({ default: m.RefundPolicy })));
const AgeIdPolicy = lazyPage(() => import("./pages/LegalPages").then((m) => ({ default: m.AgeIdPolicy })));

const GSC_TOKEN = (process.env.REACT_APP_GOOGLE_SITE_VERIFICATION || "").trim();

const SiteSeo = () => {
  useEffect(() => {
    setJsonLd("site", [storeJsonLd(), websiteJsonLd()]);
    if (GSC_TOKEN && !document.head.querySelector('meta[name="google-site-verification"]')) {
      const m = document.createElement("meta");
      m.name = "google-site-verification";
      m.content = GSC_TOKEN;
      document.head.appendChild(m);
    }
  }, []);
  return null;
};

const Private = ({ title, children }) => (
  <>
    <Seo noindex title={`${title} | HD Smoke Shop`} description={`${title} at HD Smoke Shop.`} />
    {children}
  </>
);

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
};

const SiteTheme = () => {
  const { presentation } = useCart();
  const { search } = useLocation();
  const preview = getThemePreview(search);
  const theme = resolveSiteTheme(presentation?.homepageLayout, search);

  useEffect(() => {
    const root = document.documentElement;
    SITE_THEMES.forEach((name) => root.classList.remove(`site-theme-${name}`));
    if (theme !== "classic") {
      root.classList.add(`site-theme-${theme}`);
      root.dataset.siteTheme = theme;
    } else {
      delete root.dataset.siteTheme;
    }
    return () => {
      SITE_THEMES.forEach((name) => root.classList.remove(`site-theme-${name}`));
      delete root.dataset.siteTheme;
    };
  }, [theme]);

  // Classic is the original storefront and must remain pixel-for-pixel free of
  // preview or theme-system decoration.
  if (!preview || theme === "classic") return null;
  return <div className="site-preview-ribbon" role="status">Private full-site preview · {themeLabel(theme)} · Nothing is published</div>;
};

const AppRoutes = () => {
  return (
    <Suspense fallback={<div className="min-h-[60vh]" aria-busy="true" />}>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/shop" element={<ShopPage />} />
      <Route path="/shop/:slug" element={<ProductDetail />} />
      <Route path="/product-category/:slug" element={<ShopPage />} />
      <Route path="/brand/:slug" element={<ShopPage />} />
      <Route path="/brands" element={<BrandsPage />} />
      <Route path="/delivery-area" element={<DeliveryAreaPage />} />
      <Route path="/delivery/lake-nona" element={<LakeNonaDeliveryPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/guides" element={<GuidesIndex />} />
      <Route path="/guides/:slug" element={<GuideArticle />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/delivery-policy" element={<DeliveryPolicy />} />
      <Route path="/refund-policy" element={<RefundPolicy />} />
      <Route path="/age-and-id-policy" element={<AgeIdPolicy />} />
      <Route path="/request-product" element={<ProductRequestPage />} />
      <Route path="/replacement/:token" element={<ReplacementApproval />} />
      <Route path="/live-shelf" element={<LiveShelfPage />} />
      <Route path="/cart" element={<Private title="Your Cart"><CartPage /></Private>} />
      <Route path="/wishlist" element={<Private title="Your Wishlist"><WishlistPage /></Private>} />
      <Route path="/checkout" element={<Private title="Checkout"><CheckoutPage /></Private>} />
      <Route path="/order/:id" element={<Private title="Order Details"><OrderPage /></Private>} />
      <Route path="/track" element={<Private title="Track Your Order"><TrackPage /></Private>} />
      <Route path="/my-account" element={<Private title="My Account"><AuthPage /></Private>} />
      <Route path="/driver-app" element={<Private title="Driver App"><AdminDriver standalone /></Private>} />
      <Route path="/admin" element={<Private title="Admin"><AdminLayout /></Private>}>
        <Route index element={<AdminDashboard />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="operations" element={<AdminOperations />} />
        <Route path="driver" element={<AdminDriver />} />
        <Route path="picking" element={<AdminPicking />} />
        <Route path="product-requests" element={<AdminProductRequests />} />
        <Route path="compliance" element={<AdminCompliance />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="agents" element={<AdminAgents />} />
        <Route path="inventory-capture" element={<InventoryCapture />} />
        <Route path="missing-photos" element={<MissingPhotos />} />
        <Route path="missing-barcodes" element={<MissingBarcodes />} />
        <Route path="product-details" element={<ProductDetails />} />
        <Route path="missing-details" element={<MissingDetails />} />
        <Route path="reviews" element={<AdminReviews />} />
        <Route path="receipts" element={<StoreReceipts />} />
        <Route path="expenses" element={<BusinessExpenses />} />
        <Route path="documents" element={<AdminDocuments />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="clover" element={<AdminClover />} />
        <Route path="loyalty" element={<AdminLoyalty />} />
        <Route path="chat" element={<AdminChat />} />
        <Route path="alerts" element={<AdminAlerts />} />
        <Route path="banners" element={<AdminBanners />} />
        <Route path="brands" element={<AdminBrands />} />
        <Route path="categories" element={<AdminCategories />} />
        <Route path="emails" element={<AdminEmails />} />
        <Route path="promos" element={<AdminPromos />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
  );
};

const AppFrame = () => {
  const { pathname } = useLocation();
  const dedicatedDriver = pathname === "/driver-app";
  return <>
    <SiteSeo />
    <Analytics />
    <ScrollToTop />
    {!dedicatedDriver && <AgeGate />}
    {!dedicatedDriver && <SiteTheme />}
    {!dedicatedDriver && <Header />}
    {!dedicatedDriver && <ServiceWakeBanner />}
    <main><AppRoutes /></main>
    {!dedicatedDriver && <Footer />}
    {!dedicatedDriver && <ChatWidget />}
    {!dedicatedDriver && <CompareTray />}
    {!dedicatedDriver && <SalCartPop />}
    {!dedicatedDriver && <MobileBottomNav />}
    {!dedicatedDriver && <PwaExperience />}
    <Toaster />
  </>;
};

function App() {
  return (
    <div className="App">
      <AppProvider>
        <CartProvider>
          <WishlistProvider>
            <CatalogProvider>
            <BrowserRouter>
              <AppFrame />
            </BrowserRouter>
            </CatalogProvider>
          </WishlistProvider>
        </CartProvider>
      </AppProvider>
    </div>
  );
}

export default App;
