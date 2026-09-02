import React, { useEffect } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import { CartProvider } from "./context/CartContext";
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
import { BrandsPage, AboutPage } from "./pages/StaticPages";

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
};

function App() {
  return (
    <div className="App">
      <AppProvider>
        <CartProvider>
          <BrowserRouter>
            <ScrollToTop />
            <AgeGate />
            <Header />
            <main>
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
                <Route path="/checkout" element={<CheckoutPage />} />
                <Route path="/order/:id" element={<OrderPage />} />
                <Route path="/track" element={<TrackPage />} />
                <Route path="/my-account" element={<AuthPage />} />
              </Routes>
            </main>
            <Footer />
            <Toaster />
          </BrowserRouter>
        </CartProvider>
      </AppProvider>
    </div>
  );
}

export default App;
