/**
 * CONTRACT 6A — CERTIFICATE GENERATOR
 * Creates certificates with locked issuer authority
 */

import { useState } from 'react';
import { Award, FileCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { 
  createCertificate, 
  Certificate, 
  CertificateRecipient,
  CERTIFICATE_TYPES,
  CertificateType 
} from '@/lib/certificateAuthority';
import { CertificateDisplay } from './CertificateDisplay';

interface CertificateGeneratorProps {
  bookId: string;
  bookTitle: string;
  bookType: string;
  chaptersCompleted: number;
  totalChapters: number;
  wordCount?: number;
  learningLevel?: string;
  userId: string;
  userName: string;
  userEmail?: string;
  progressPercent: number;
  onCertificateGenerated?: (certificate: Certificate) => void;
}

export function CertificateGenerator({
  bookId,
  bookTitle,
  bookType,
  chaptersCompleted,
  totalChapters,
  wordCount,
  learningLevel,
  userId,
  userName,
  userEmail,
  progressPercent,
  onCertificateGenerated,
}: CertificateGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [selectedType, setSelectedType] = useState<CertificateType>('completion');
  const { toast } = useToast();

  const canGenerateCertificate = progressPercent >= 100;
  const canGenerateMastery = progressPercent >= 100 && learningLevel === 'mastery';

  const handleGenerate = async () => {
    if (!canGenerateCertificate) {
      toast({
        title: 'Complete the book first',
        description: `You've completed ${progressPercent}% of this book. Finish all chapters to receive your certificate.`,
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);

    try {
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1500));

      const recipient: CertificateRecipient = {
        name: userName,
        email: userEmail,
        userId,
      };

      const newCertificate = createCertificate(recipient, {
        bookTitle,
        bookType,
        completionDate: new Date(),
        wordCount,
        chaptersCompleted,
        totalChapters,
        learningLevel,
      });

      setCertificate(newCertificate);
      onCertificateGenerated?.(newCertificate);

      toast({
        title: 'Certificate Generated! 🎉',
        description: `Your ${CERTIFICATE_TYPES[selectedType].displayName} has been created and verified.`,
      });
    } catch (error) {
      toast({
        title: 'Generation Failed',
        description: 'Unable to generate certificate. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!certificate) return;
    
    // In production, this would generate a PDF
    toast({
      title: 'Download Started',
      description: 'Your certificate PDF is being prepared...',
    });
  };

  if (certificate) {
    return (
      <div className="space-y-6">
        <CertificateDisplay 
          certificate={certificate} 
          certificateType={selectedType}
          onDownload={handleDownload}
        />
        
        <div className="flex justify-center">
          <Button 
            variant="outline" 
            onClick={() => setCertificate(null)}
          >
            Generate Another Certificate
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5 text-primary" />
          Certificate of Achievement
        </CardTitle>
        <CardDescription>
          Generate your official ScrollLibrary certificate upon completion
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Progress Status */}
        <div className="p-4 rounded-lg bg-muted/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Book Progress</span>
            <span className="text-sm text-muted-foreground">{progressPercent}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {chaptersCompleted} of {totalChapters} chapters completed
          </p>
        </div>

        {/* Certificate Type Selection */}
        <div className="space-y-3">
          <label className="text-sm font-medium">Certificate Type</label>
          <div className="grid gap-3">
            {Object.values(CERTIFICATE_TYPES).map((type) => {
              const isDisabled = 
                (type.type === 'mastery' && !canGenerateMastery) ||
                (type.requiresMinProgress > 0 && progressPercent < type.requiresMinProgress);
              
              return (
                <button
                  key={type.type}
                  onClick={() => setSelectedType(type.type)}
                  disabled={isDisabled}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    selectedType === type.type
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  } ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{type.displayName}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {type.description}
                      </p>
                    </div>
                    {selectedType === type.type && (
                      <FileCheck className="h-5 w-5 text-primary flex-shrink-0" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={!canGenerateCertificate || isGenerating}
          className="w-full"
          size="lg"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating Certificate...
            </>
          ) : canGenerateCertificate ? (
            <>
              <Award className="h-4 w-4 mr-2" />
              Generate {CERTIFICATE_TYPES[selectedType].displayName}
            </>
          ) : (
            <>
              Complete Book to Unlock Certificate
            </>
          )}
        </Button>

        {/* Info Note */}
        <p className="text-xs text-muted-foreground text-center">
          Certificates are issued by ScrollLibrary Certification Authority and include 
          verifiable credentials with unique publishing codes.
        </p>
      </CardContent>
    </Card>
  );
}
