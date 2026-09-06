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
import AuthCallback from "./components/AuthCallback";
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
import { BrandsPage, AboutPage } from "./pages/StaticPages";
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
import ChatWidget from "./components/chat/ChatWidget";
import Seo, { setJsonLd } from "./seo/Seo";
import Analytics from "./seo/Analytics";
import { organizationJsonLd, websiteJsonLd } from "./seo/config";

const GSC_TOKEN = (process.env.REACT_APP_GOOGLE_SITE_VERIFICATION || "").trim();

const SiteSeo = () => {
  useEffect(() => {
    setJsonLd("site", [organizationJsonLd(), websiteJsonLd()]);
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
    <Seo noindex title={`${title} | Puff2door`} description={`${title} at Puff2door.`} />
    {children}
  </>
);

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
};

const AppRoutes = () => {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
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
              <main>
                <AppRoutes />
              </main>
              <Footer />
              <ChatWidget />
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
