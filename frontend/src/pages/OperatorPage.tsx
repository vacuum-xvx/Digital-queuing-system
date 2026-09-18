import { OperatorWorkspace } from '../features/operator/OperatorWorkspace';

export function OperatorPage() {
  return <OperatorWorkspace branchId="1" currentUser={{role: 'employee'}} logout={() => {}} setActiveTab={() => {}} />;
}

