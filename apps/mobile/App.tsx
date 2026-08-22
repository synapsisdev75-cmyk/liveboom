import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

/** Placeholder de la app móvil. NativeWind + navegación llegan en el Paso 4. */
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.mark}>Liveboom</Text>
      <Text style={styles.sub}>App móvil lista para el Paso 4</Text>
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    color: '#00F0FF',
    fontSize: 32,
    fontWeight: '800',
  },
  sub: {
    marginTop: 8,
    color: '#A1A1AA',
    fontSize: 14,
  },
});
