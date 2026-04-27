/**
 * Public certificate lookup — employers/registrars enter a number and verify.
 * No auth required. Route: /verify-certificate
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Shield, Search, CheckCircle2, FileSearch } from "lucide-react";
import { Logo } from "@/components/brand";
import { Link } from "react-router-dom";

import { SEO } from "@/components/SEO";
export default function VerifyLookup() {
  const [number, setNumber] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Verify a certificate — ScrollLibrary";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Verify the authenticity of a ScrollLibrary certificate by certificate number.");
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = number.trim();
    if (!cleaned) return;
    navigate(`/certificate/${encodeURIComponent(cleaned)}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <SEO
        title="Verify a Certificate | ScrollLibrary"
        description="Enter a ScrollLibrary certificate number to instantly verify its authenticity, mastery level, and issuing learner."
        canonical="/verify-certificate"
      />
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo variant="icon" size="sm" />
            <span className="font-semibold">ScrollLibrary</span>
          </Link>
          <span className="text-xs text-muted-foreground">Public verification portal</span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mb-4">
            <Shield className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Verify a certificate</h1>
          <p className="text-muted-foreground">
            Enter a ScrollLibrary certificate number to confirm authenticity, holder, and integrity.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSearch className="h-5 w-5" /> Certificate lookup
            </CardTitle>
            <CardDescription>
              Numbers are typically formatted like <code className="px-1.5 py-0.5 rounded bg-muted text-xs">SL-XXXX-XXXX</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="SL-2025-ABCD1234"
                className="flex-1 font-mono"
                aria-label="Certificate number"
                autoFocus
              />
              <Button type="submit" disabled={!number.trim()}>
                <Search className="h-4 w-4 mr-2" /> Verify
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="grid sm:grid-cols-3 gap-3 mt-8">
          {[
            { icon: CheckCircle2, label: "Tamper-proof", body: "Each certificate is cryptographically bound to the source manuscript." },
            { icon: Shield, label: "Authority-issued", body: "Issued by the ScrollLibrary Certification Authority." },
            { icon: FileSearch, label: "Public record", body: "Anyone can verify — no account required." },
          ].map(({ icon: Icon, label, body }) => (
            <Card key={label} className="bg-muted/30">
              <CardContent className="pt-5">
                <Icon className="h-5 w-5 text-primary mb-2" />
                <p className="font-medium text-sm">{label}</p>
                <p className="text-xs text-muted-foreground mt-1">{body}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          For details on how certification works, see{" "}
          <Link to="/docs/how-certification-works" className="underline">
            How certification works
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
