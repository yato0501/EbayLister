import { ActivityIndicator, StyleSheet } from 'react-native';

export const LoadingIndicator = () => {
  return <ActivityIndicator size="large" color="#0000ff" style={styles.loader} />;
};

const styles = StyleSheet.create({
  loader: {
    marginTop: 20,
  },
});
