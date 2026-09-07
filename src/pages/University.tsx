import { Link, useSearchParams } from 'react-router-dom';
import { PlugZap, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import UniversityHub from '@/components/university/UniversityHub';
import UniversityAcademicAdministration from '@/components/university/UniversityAcademicAdministration';
import UniversityInteroperability from '@/components/university/UniversityInteroperability';
import UniversityLtiClaim from '@/pages/UniversityLtiClaim';

export default function University() {
  const [params] = useSearchParams();

  if (params.has('lti_launch')) {
    return <UniversityLtiClaim />;
  }

  if (params.get('view') === 'administration') {
    return <UniversityAcademicAdministration />;
  }

  if (params.get('view') === 'interoperability') {
    return <UniversityInteroperability />;
  }

  return (
    <>
      <UniversityHub />
      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
        <Button asChild variant="secondary" className="shadow-lg">
          <Link to="/university?view=administration">
            <Settings2 className="mr-2 h-4 w-4" />
            Academic administration
          </Link>
        </Button>
        <Button asChild variant="outline" className="bg-background shadow-lg">
          <Link to="/university?view=interoperability">
            <PlugZap className="mr-2 h-4 w-4" />
            LMS & verification
          </Link>
        </Button>
      </div>
    </>
  );
}
