import React from "react";
import { Navigate } from "react-router-dom";

// Kept as a safe redirect for old bookmarked callback URLs.
const AuthCallback = () => <Navigate to="/my-account" replace />;

export default AuthCallback;
