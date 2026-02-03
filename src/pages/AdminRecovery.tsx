import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Shield, Loader2 } from 'lucide-react';
import { clearAdminCache } from '@/hooks/useAdmin';

export default function AdminRecovery() {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleClaimAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!code.trim()) {
      toast.error('Please enter the admin claim code');
      return;
    }

    setIsLoading(true);

    try {
      // Check if user is logged in
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error('Please log in first');
        navigate('/login');
        return;
      }

      const { data, error } = await supabase.functions.invoke('claim-admin', {
        body: { code: code.trim() }
      });

      if (error) {
        console.error('Claim admin error:', error);
        toast.error(error.message || 'Failed to claim admin');
        return;
      }

      if (data?.success) {
        toast.success(data.message || 'Admin access granted!');
        // Clear admin cache to force immediate recognition
        clearAdminCache();
        setTimeout(() => {
          navigate('/admin');
          window.location.reload();
        }, 1000);
      } else {
        toast.error(data?.error || 'Failed to claim admin');
      }
    } catch (err) {
      console.error('Error claiming admin:', err);
      toast.error('An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <CardTitle>Admin Recovery</CardTitle>
          <CardDescription>
            Enter your admin claim code to restore admin privileges
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleClaimAdmin} className="space-y-4">
            <Input
              type="password"
              placeholder="Enter admin claim code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={isLoading}
            />
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Claiming...
                </>
              ) : (
                'Claim Admin Access'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
