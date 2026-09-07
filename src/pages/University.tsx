import { Link, useSearchParams } from 'react-router-dom';
import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import UniversityHub from '@/components/university/UniversityHub';
import UniversityAcademicAdministration from '@/components/university/UniversityAcademicAdministration';

export default function University() {
  const [params] = useSearchParams();

  if (params.get('view') === 'administration') {
    return <UniversityAcademicAdministration />;
  }

  return (
    <>
      <UniversityHub />
      <div className="fixed bottom-5 right-5 z-40">
        <Button asChild variant="secondary" className="shadow-lg">
          <Link to="/university?view=administration">
            <Settings2 className="mr-2 h-4 w-4" />
            Academic administration
          </Link>
        </Button>
      </div>
    </>
  );
}
