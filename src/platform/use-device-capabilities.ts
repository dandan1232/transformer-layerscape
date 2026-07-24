import { useEffect, useState } from 'react'
import {
  detectDeviceCapabilities,
  observeCapabilityChanges,
  type DeviceCapabilities,
} from './capabilities'

export function useDeviceCapabilities(): DeviceCapabilities {
  const [capabilities, setCapabilities] = useState(detectDeviceCapabilities)

  useEffect(
    () =>
      observeCapabilityChanges(() => {
        setCapabilities(detectDeviceCapabilities())
      }),
    [],
  )

  return capabilities
}
