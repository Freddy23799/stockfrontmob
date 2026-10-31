import { useLocalSearchParams } from 'expo-router';

import Operations from '@/workspace/management/Operations';

export default function ShopOperations() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Operations shopId={id} />;
}
