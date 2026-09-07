import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, BookOpenCheck, PlugZap, Route, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import UniversityHub from '@/components/university/UniversityHub';
import UniversityAcademicAdministration from '@/components/university/UniversityAcademicAdministration';
import UniversityCourseGovernance from '@/components/university/UniversityCourseGovernance';
import UniversityCourseMaterials from '@/components/university/UniversityCourseMaterials';
import UniversityInteroperability from '@/components/university/UniversityInteroperability';
import UniversityStudentLifecycleWorkspace from '@/components/university/UniversityStudentLifecycleWorkspace';
import UniversityLtiClaim from '@/pages/UniversityLtiClaim';

export default function University() {
  const [params] = useSearchParams();

  if (params.has('lti_launch')) {
    return <UniversityLtiClaim />;
  }

  if (params.get('view') === 'materials') {
    return <UniversityCourseMaterials />;
  }

  if (params.get('view') === 'catalogue') {
    return <UniversityCourseGovernance />;
  }

  if (params.get('view') === 'lifecycle') {
    return <UniversityStudentLifecycleWorkspace />;
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
        <Button asChild className="shadow-lg">
          <Link to="/university?view=materials">
            <BookOpen className="mr-2 h-4 w-4" />
            Course materials
          </Link>
        </Button>
        <Button asChild variant="secondary" className="shadow-lg">
          <Link to="/university?view=catalogue">
            <BookOpenCheck className="mr-2 h-4 w-4" />
            Course governance
          </Link>
        </Button>
        <Button asChild variant="secondary" className="shadow-lg">
          <Link to="/university?view=lifecycle">
            <Route className="mr-2 h-4 w-4" />
            Student lifecycle
          </Link>
        </Button>
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
