import { useSearchParams } from 'react-router-dom';
import UniversityHub from '@/components/university/UniversityHub';
import UniversityAcademicAdministration from '@/components/university/UniversityAcademicAdministration';
import UniversityCourseGovernance from '@/components/university/UniversityCourseGovernance';
import UniversityCourseMaterials from '@/components/university/UniversityCourseMaterials';
import UniversityInteroperability from '@/components/university/UniversityInteroperability';
import UniversityLanding from '@/components/university/UniversityLanding';
import UniversityStudentLifecycleWorkspace from '@/components/university/UniversityStudentLifecycleWorkspace';
import UniversityWorkspaceHome from '@/components/university/UniversityWorkspaceHome';
import UniversityLtiClaim from '@/pages/UniversityLtiClaim';

export default function University() {
  const [params] = useSearchParams();
  const view = params.get('view');

  if (params.has('lti_launch')) {
    return <UniversityLtiClaim />;
  }

  if (view === 'about') {
    return <UniversityLanding />;
  }

  if (view === 'operations') {
    return <UniversityHub />;
  }

  if (view === 'materials') {
    return <UniversityCourseMaterials />;
  }

  if (view === 'catalogue') {
    return <UniversityCourseGovernance />;
  }

  if (view === 'lifecycle') {
    return <UniversityStudentLifecycleWorkspace />;
  }

  if (view === 'administration') {
    return <UniversityAcademicAdministration />;
  }

  if (view === 'interoperability') {
    return <UniversityInteroperability />;
  }

  return <UniversityWorkspaceHome />;
}
