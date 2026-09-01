import "server-only";

import { env } from "@/lib/env";

import { AutoPro24VehicleProvider } from "./autopro24";
import { MockVehicleProvider } from "./mock";
import type { VehicleProvider } from "./types";
import { WillhabenVehicleProvider } from "./willhaben";

/**
 * Registry der Fahrzeugquellen (US-25).
 *
 * Der Rest der Anwendung ruft ausschließlich `getVehicleProvider()` auf und
 * kennt keinen konkreten Anbieter. Ein neuer Provider wird hier eingetragen –
 * sonst ändert sich nichts.
 */

export type VehicleProviderKey = "mock" | "autopro24" | "willhaben";

const FACTORIES: Record<VehicleProviderKey, () => VehicleProvider> = {
  mock: () => new MockVehicleProvider(),
  autopro24: () => new AutoPro24VehicleProvider(),
  willhaben: () => new WillhabenVehicleProvider(),
};

const instances = new Map<VehicleProviderKey, VehicleProvider>();

export function getVehicleProviderByKey(
  key: VehicleProviderKey,
): VehicleProvider {
  let instance = instances.get(key);

  if (!instance) {
    instance = FACTORIES[key]();
    instances.set(key, instance);
  }

  return instance;
}

/** Der über VEHICLE_PROVIDER konfigurierte Anbieter. */
export function getVehicleProvider(): VehicleProvider {
  return getVehicleProviderByKey(env().VEHICLE_PROVIDER);
}

/** Übersicht aller Provider – für die Integrationsseite im Admin. */
export function listVehicleProviders(): {
  key: VehicleProviderKey;
  label: string;
  source: string;
  configured: boolean;
  active: boolean;
}[] {
  const activeKey = env().VEHICLE_PROVIDER;

  return (Object.keys(FACTORIES) as VehicleProviderKey[]).map((key) => {
    const provider = getVehicleProviderByKey(key);
    return {
      key,
      label: provider.label,
      source: provider.source,
      configured: provider.isConfigured(),
      active: key === activeKey,
    };
  });
}

export { MockVehicleProvider } from "./mock";
export { AutoPro24VehicleProvider } from "./autopro24";
export { WillhabenVehicleProvider } from "./willhaben";
export * from "./types";
