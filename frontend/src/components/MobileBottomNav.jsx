import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Store, Search, MapPinned, UserRound } from "lucide-react";

const links = [["/", "Home", Home], ["/shop", "Shop", Store], ["/shop?focus=search", "Search", Search], ["/track", "Track", MapPinned], ["/my-account", "Account", UserRound]];
const MobileBottomNav = () => {
  const { pathname } = useLocation();
  if (pathname.startsWith("/admin") || pathname === "/checkout") return null;
  return <nav className="mobile-bottom-nav" aria-label="Main app navigation">
    {links.map(([to, label, Icon]) => <Link key={label} to={to} className={pathname === to || (to === "/shop" && pathname.startsWith("/shop")) ? "active" : ""}><Icon className="h-5 w-5" /><span>{label}</span></Link>)}
  </nav>;
};
export default MobileBottomNav;
