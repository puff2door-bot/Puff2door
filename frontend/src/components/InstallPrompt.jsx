import React, { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
const InstallPrompt = () => {
  const [prompt, setPrompt] = useState(null);
  const [hidden, setHidden] = useState(() => sessionStorage.getItem("p2d_install_hidden") === "1");
  useEffect(() => { const onPrompt = (e) => { e.preventDefault(); setPrompt(e); }; window.addEventListener("beforeinstallprompt", onPrompt); return () => window.removeEventListener("beforeinstallprompt", onPrompt); }, []);
  if (!prompt || hidden) return null;
  return <div className="install-prompt"><Download className="h-5 w-5 text-emerald-600" /><div className="flex-1"><strong>Install Puff2door</strong><p>Add the store to your home screen for faster ordering.</p></div><button className="install-action" onClick={async () => { await prompt.prompt(); setPrompt(null); }}>Install</button><button aria-label="Dismiss" onClick={() => { sessionStorage.setItem("p2d_install_hidden", "1"); setHidden(true); }}><X className="h-4 w-4" /></button></div>;
};
export default InstallPrompt;
