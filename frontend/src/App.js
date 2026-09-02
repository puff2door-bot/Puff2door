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
import NotFound from "./pages/NotFound";

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
      <Route path="/about" element={<AboutPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/cart" element={<CartPage />} />
      <Route path="/wishlist" element={<WishlistPage />} />
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/order/:id" element={<OrderPage />} />
      <Route path="/track" element={<TrackPage />} />
      <Route path="/my-account" element={<AuthPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="alerts" element={<AdminAlerts />} />
        <Route path="banners" element={<AdminBanners />} />
        <Route path="emails" element={<AdminEmails />} />
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
              <ScrollToTop />
              <AgeGate />
              <Header />
              <main>
                <AppRoutes />
              </main>
              <Footer />
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
