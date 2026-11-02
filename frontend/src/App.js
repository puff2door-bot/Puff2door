import React, { useEffect } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import { CartProvider } from "./context/CartContext";
import { WishlistProvider } from "./context/WishlistContext";
import { CatalogProvider } from "./context/CatalogContext";
import { Toaster } from "./components/ui/toaster";
import Header from "./components/Header";
import Footer from "./components/Footer";
import AgeGate from "./components/AgeGate";
import Home from "./pages/Home";
import ShopPage from "./pages/ShopPage";
import ProductDetail from "./pages/ProductDetail";
import CartPage from "./pages/CartPage";
import CheckoutPage from "./pages/CheckoutPage";
import OrderPage from "./pages/OrderPage";
import TrackPage from "./pages/TrackPage";
import AuthPage from "./pages/AuthPage";
import ContactPage from "./pages/ContactPage";
import WishlistPage from "./pages/WishlistPage";
import { BrandsPage, AboutPage, FaqPage } from "./pages/StaticPages";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminProducts from "./pages/admin/AdminProducts";
import AdminOrders from "./pages/admin/AdminOrders";
import AdminAlerts from "./pages/admin/AdminAlerts";
import AdminBanners from "./pages/admin/AdminBanners";
import AdminEmails from "./pages/admin/AdminEmails";
import AdminPromos from "./pages/admin/AdminPromos";
import AdminSettings from "./pages/admin/AdminSettings";
import NotFound from "./pages/NotFound";
import DeliveryAreaPage from "./pages/DeliveryAreaPage";
import AdminBrands from "./pages/admin/AdminBrands";
import AdminCategories from "./pages/admin/AdminCategories";
import AdminLoyalty from "./pages/admin/AdminLoyalty";
import AdminChat from "./pages/admin/AdminChat";
import AdminOperations from "./pages/admin/AdminOperations";
import AdminCompliance from "./pages/admin/AdminCompliance";
import AdminAnalytics from "./pages/admin/AdminAnalytics";
import InventoryCapture from "./pages/admin/InventoryCapture";
import AdminClover from "./pages/admin/AdminClover";
import ChatWidget from "./components/chat/ChatWidget";
import Seo, { setJsonLd } from "./seo/Seo";
import Analytics from "./seo/Analytics";
import MobileBottomNav from "./components/MobileBottomNav";
import CompareTray from "./components/CompareTray";
import PwaExperience from "./components/PwaExperience";
import ServiceWakeBanner from "./components/ServiceWakeBanner";
import { storeJsonLd, websiteJsonLd } from "./seo/config";
import { PrivacyPolicy, TermsPage, DeliveryPolicy, RefundPolicy, AgeIdPolicy } from "./pages/LegalPages";

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

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/shop" element={<ShopPage />} />
      <Route path="/shop/:slug" element={<ProductDetail />} />
      <Route path="/product-category/:slug" element={<ShopPage />} />
      <Route path="/brand/:slug" element={<ShopPage />} />
      <Route path="/brands" element={<BrandsPage />} />
      <Route path="/delivery-area" element={<DeliveryAreaPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/delivery-policy" element={<DeliveryPolicy />} />
      <Route path="/refund-policy" element={<RefundPolicy />} />
      <Route path="/age-and-id-policy" element={<AgeIdPolicy />} />
      <Route path="/cart" element={<Private title="Your Cart"><CartPage /></Private>} />
      <Route path="/wishlist" element={<Private title="Your Wishlist"><WishlistPage /></Private>} />
      <Route path="/checkout" element={<Private title="Checkout"><CheckoutPage /></Private>} />
      <Route path="/order/:id" element={<Private title="Order Details"><OrderPage /></Private>} />
      <Route path="/track" element={<Private title="Track Your Order"><TrackPage /></Private>} />
      <Route path="/my-account" element={<Private title="My Account"><AuthPage /></Private>} />
      <Route path="/admin" element={<Private title="Admin"><AdminLayout /></Private>}>
        <Route index element={<AdminDashboard />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="operations" element={<AdminOperations />} />
        <Route path="compliance" element={<AdminCompliance />} />
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="inventory-capture" element={<InventoryCapture />} />
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
  );
};

function App() {
  return (
    <div className="App">
      <AppProvider>
        <CartProvider>
          <WishlistProvider>
            <CatalogProvider>
            <BrowserRouter>
              <SiteSeo />
              <Analytics />
              <ScrollToTop />
              <AgeGate />
              <Header />
              <ServiceWakeBanner />
              <main>
                <AppRoutes />
              </main>
              <Footer />
              <ChatWidget />
              <CompareTray />
              <MobileBottomNav />
              <PwaExperience />
              <Toaster />
            </BrowserRouter>
            </CatalogProvider>
          </WishlistProvider>
        </CartProvider>
      </AppProvider>
    </div>
  );
}

export default App;
