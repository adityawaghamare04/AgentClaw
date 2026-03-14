import { useState, useRef, useEffect } from "react";
import { api, type RegisterResult } from "../../lib/api.js";
import { usdToEth } from "../../lib/ethPrice.js";

interface RegisterStepProps {
  onNext: (agentId: string) => void;
}

type TokenChoice = "launch" | "existing" | "none";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function RegisterStep({ onNext }: RegisterStepProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [skills, setSkills] = useState("");
  const [price, setPrice] = useState("10");
  const [tokenChoice, setTokenChoice] = useState<TokenChoice>("none");
  const [symbol, setSymbol] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RegisterResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [ethPrice, setEthPrice] = useState<number>(0);

  useEffect(() => {
    api.getEthPrice().then(({ price }) => setEthPrice(price)).catch(() => {});
  }, []);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5MB");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError("");
  }

  async function handleRegister() {
    if (!name.trim() || !description.trim()) return;
    if (tokenChoice === "launch" && !imageFile) {
      setError("Image is required for token launch");
      return;
    }
    setRegistering(true);
    setError("");
    try {
      let imageData: string | undefined;
      if (imageFile) {
        imageData = await fileToDataUrl(imageFile);
      }
      // Convert USD price → ETH for on-chain registration
      const priceEth = ethPrice > 0 ? usdToEth(parseFloat(price) || 0, ethPrice) : price.trim();

      const res = await api.registerAgent({
        name: name.trim(),
        description: description.trim(),
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        price: priceEth,
        symbol: tokenChoice === "launch" ? symbol.trim() || undefined : undefined,
        token: tokenChoice === "existing" ? tokenAddress.trim() || undefined : undefined,
        image: imageData,
        website: website.trim() || undefined,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setRegistering(false);
    }
  }

  if (result) {
    const isPending = result.registrationStatus === "pending";
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-mono font-bold text-zinc-200 mb-1">
            {isPending ? "Registration Submitted" : "Registered"}
          </h2>
          <p className="text-[11px] text-zinc-600 font-mono">
            {isPending
              ? "Pending admin approval. Your agent is registered on-chain."
              : "Agent is live on the marketplace."}
          </p>
        </div>
        <div className="panel p-4 space-y-2">
          <div className="flex justify-between text-[11px] font-mono">
            <span className="text-zinc-600">Agent ID</span>
            <span className="text-red-400">{result.agentId}</span>
          </div>
          {result.tokenSymbol && (
            <div className="flex justify-between text-[11px] font-mono">
              <span className="text-zinc-600">Token</span>
              <span className="text-zinc-300">${result.tokenSymbol}</span>
            </div>
          )}
          {result.tokenAddress && (
            <div className="flex justify-between text-[11px] font-mono">
              <span className="text-zinc-600">Token Address</span>
              <span className="text-zinc-400 truncate max-w-[200px]">{result.tokenAddress}</span>
            </div>
          )}
          {isPending && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-zinc-800/50">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span className="text-[10px] text-amber-400/70 font-mono">PENDING APPROVAL</span>
            </div>
          )}
        </div>
        {result.flaunchUrl && (
          <a
            href={result.flaunchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center py-2 border border-zinc-800 rounded-sm text-[10px] text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 font-mono tracking-wider transition-colors"
          >
            VIEW TOKEN ON FLAUNCH &rarr;
          </a>
        )}
        <button
          onClick={() => onNext(result.agentId)}
          className="w-full py-2.5 bg-zinc-100 text-zinc-900 rounded-sm text-[11px] font-mono font-bold tracking-wider hover:bg-white transition-colors"
        >
          CONNECT LLM
        </button>
      </div>
    );
  }

  const TOKEN_OPTIONS: { value: TokenChoice; label: string; desc: string; detail: string }[] = [
    { value: "none", label: "NO TOKEN", desc: "Direct ETH payments", detail: "Clients pay you in ETH. Simple, no token needed." },
    { value: "launch", label: "LAUNCH TOKEN", desc: "New Flaunch token", detail: "Launch a tradeable token. You earn 10% of all trading fees forever. Requires an image." },
    { value: "existing", label: "USE EXISTING", desc: "Existing ERC-20", detail: "Link an existing token on Base. Cosmetic — displayed on your profile." },
  ];

  const needsImage = tokenChoice === "launch";
  const missingImage = needsImage && !imageFile;

  const inputCls = "w-full bg-zinc-950 border border-red-500/10 rounded-sm px-3 py-2 text-[11px] font-mono text-zinc-400 focus:outline-none focus:border-red-500/25 transition-colors";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-mono font-bold text-zinc-200 mb-1">Register Agent</h2>
        <p className="text-[11px] text-zinc-600 font-mono leading-relaxed">
          Deploy to the marketplace. Accepts paid tasks 24/7 once live.
        </p>
      </div>

      {error && (
        <div className="panel px-4 py-3 text-[11px] text-red-400 font-mono">{error}</div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-[8px] text-zinc-700 font-mono font-bold tracking-[0.2em] mb-1">NAME</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Work Agent" className={inputCls} />
        </div>

        <div>
          <label className="block text-[8px] text-zinc-700 font-mono font-bold tracking-[0.2em] mb-1">DESCRIPTION</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does your agent do?" rows={3} className={`${inputCls} resize-none`} />
        </div>

        <div>
          <label className="block text-[8px] text-zinc-700 font-mono font-bold tracking-[0.2em] mb-1">SKILLS</label>
          <input type="text" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="typescript, react, solidity" className={inputCls} />
        </div>

        <div>
          <label className="block text-[8px] text-zinc-700 font-mono font-bold tracking-[0.2em] mb-1">BASE PRICE (USD)</label>
          <input type="text" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="10" className={inputCls} />
          {ethPrice > 0 && (
            <p className="text-[9px] text-zinc-800 mt-0.5 font-mono">≈ {usdToEth(parseFloat(price) || 0, ethPrice)} ETH</p>
          )}
        </div>

        <div>
          <label className="block text-[8px] text-zinc-700 font-mono font-bold tracking-[0.2em] mb-1.5">TOKEN</label>
          <div className="space-y-1.5">
            {TOKEN_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTokenChoice(opt.value)}
                className={`w-full px-3 py-2.5 rounded-sm text-left border transition-all duration-100 ${
                  tokenChoice === opt.value
                    ? "border-red-500/25 text-zinc-300 bg-red-500/5"
                    : "border-zinc-800 text-zinc-600 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-[9px] tracking-wider">{opt.label}</span>
                  <span className="text-[9px] text-zinc-700 font-mono">{opt.desc}</span>
                </div>
                {tokenChoice === opt.value && (
                  <p className="text-[9px] text-zinc-600 font-mono mt-1 leading-relaxed">{opt.detail}</p>
                )}
              </button>
            ))}
          </div>
        </div>

        {tokenChoice === "launch" && (
          <>
            <div>
              <label className="block text-[8px] text-zinc-700 font-mono font-bold tracking-[0.2em] mb-1">SYMBOL</label>
              <input type="text" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="WORK" maxLength={10} className={`${inputCls} uppercase`} />
            </div>
            <div>
              <label className="block text-[8px] text-zinc-700 font-mono font-bold tracking-[0.2em] mb-1">
                TOKEN IMAGE <span className="text-red-500">*</span>
              </label>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" onChange={handleImageChange} className="hidden" />
              {imagePreview ? (
                <div className="flex items-center gap-3">
                  <img src={imagePreview} alt="Token" className="w-12 h-12 rounded-sm object-cover border border-red-500/15" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-zinc-400 font-mono truncate">{imageFile?.name}</p>
                    <p className="text-[9px] text-zinc-700 font-mono">{imageFile ? `${(imageFile.size / 1024).toFixed(0)}KB` : ""}</p>
                  </div>
                  <button onClick={() => { setImageFile(null); setImagePreview(null); if (fileRef.current) fileRef.current.value = ""; }} className="text-[9px] text-zinc-700 hover:text-zinc-400 font-mono transition-colors">REMOVE</button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full py-3 border border-dashed border-zinc-800 rounded-sm text-[10px] text-zinc-600 font-mono hover:border-zinc-700 hover:text-zinc-500 transition-colors"
                >
                  Click to upload — PNG, JPG, GIF, WebP, SVG (max 5MB)
                </button>
              )}
              {missingImage && (
                <p className="text-[9px] text-red-400/70 font-mono mt-1">Required for Flaunch token launch</p>
              )}
            </div>
          </>
        )}

        {tokenChoice === "existing" && (
          <div>
            <label className="block text-[8px] text-zinc-700 font-mono font-bold tracking-[0.2em] mb-1">TOKEN ADDRESS</label>
            <input type="text" value={tokenAddress} onChange={(e) => setTokenAddress(e.target.value)} placeholder="0x..." className={inputCls} />
          </div>
        )}

        <div>
          <label className="block text-[8px] text-zinc-700 font-mono font-bold tracking-[0.2em] mb-1">WEBSITE <span className="text-zinc-800">(optional)</span></label>
          <input type="text" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." className={inputCls} />
        </div>
      </div>

      <button
        onClick={handleRegister}
        disabled={registering || !name.trim() || !description.trim() || missingImage}
        className="w-full py-2.5 bg-red-600 text-white rounded-sm text-[11px] font-mono font-bold tracking-wider hover:bg-red-500 disabled:opacity-40 transition-colors"
      >
        {registering ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3 h-3 border-2 border-red-300 border-t-white rounded-full animate-spin" />
            REGISTERING ON-CHAIN...
          </span>
        ) : (
          "REGISTER"
        )}
      </button>

      {registering && (
        <p className="text-[9px] text-zinc-700 text-center font-mono tracking-wider">
          TX PENDING — MAY TAKE 30+ SECONDS
        </p>
      )}
    </div>
  );
}
