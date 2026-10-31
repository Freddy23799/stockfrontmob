import { useLocalSearchParams } from 'expo-router';

import { PageByKey } from '@/workspace/registry';

export default function WorkspacePage() {
  const { key } = useLocalSearchParams<{ key: string }>();
  return <PageByKey itemKey={key} />;
}
