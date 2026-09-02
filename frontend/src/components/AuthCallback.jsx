import React, { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useToast } from "../hooks/use-toast";

const AuthCallback = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { completeGoogleSession } = useApp();
  const { toast } = useToast();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const params = new URLSearchParams(location.hash.replace(/^#/, ""));
    const sessionId = params.get("session_id");
    const finish = (path) => {
      window.history.replaceState(null, "", location.pathname);
      navigate(path, { replace: true });
    };
    if (!sessionId) return finish("/my-account");
    completeGoogleSession(sessionId)
      .then((u) => {
        toast({ title: `Welcome, ${u.firstName || "friend"}!`, description: "Signed in with Google." });
        finish("/my-account");
      })
      .catch(() => {
        toast({ title: "Google sign-in failed", description: "Please try again.", variant: "destructive" });
        finish("/my-account");
      });
  }, [location, navigate, completeGoogleSession, toast]);

  return (
    <div data-testid="auth-callback" className="max-w-[1280px] mx-auto px-4 py-24 text-center text-neutral-500">
      Signing you in...
    </div>
  );
};

export default AuthCallback;
