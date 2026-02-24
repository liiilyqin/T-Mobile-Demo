/* eslint-disable */
import { useEffect, useRef, useState } from 'react';
import * as atlas from 'azure-maps-control';
import 'azure-maps-control/dist/atlas.min.css';
import { useFleet } from '../app/FleetProvider';

const DEFAULT_CENTER: [number, number] = [-122.3321, 47.6062]; // Seattle/Bellevue [lon, lat]
const DEFAULT_ZOOM = 11;
const VEHICLE_ZOOM = 12;

export default function MapPage() {
  const { vehicle, stops, currentStop, setCurrentPage } = useFleet();

  // Mark current page for global alert behavior
  useEffect(() => {
    setCurrentPage('map');
  }, [setCurrentPage]);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<atlas.Map | null>(null);
  const dataSourceRef = useRef<atlas.source.DataSource | null>(null);
  const popupRef = useRef<atlas.Popup | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize Azure Maps
  useEffect(() => {
    const subscriptionKey = import.meta.env.VITE_AZURE_MAPS_KEY as string | undefined;
    
    // DEBUG: Log env variable loading
    //
    //

    if (!subscriptionKey) {
      setError('Azure Maps subscription key not found. Please set VITE_AZURE_MAPS_KEY in your .env file.');
      return;
    }

    if (!mapRef.current) {
      //
      return;
    }
    
    //

    // Determine initial center and zoom
    let center: [number, number] = DEFAULT_CENTER;
    let zoom = DEFAULT_ZOOM;

    if (vehicle?.last_location?.lat && vehicle?.last_location?.lon) {
      center = [vehicle.last_location.lon, vehicle.last_location.lat];
      zoom = VEHICLE_ZOOM;
    }

    // Initialize map
    const map = new atlas.Map(mapRef.current, {
      center,
      zoom,
      view: 'Auto',
      authOptions: {
        authType: atlas.AuthenticationType.subscriptionKey,
        subscriptionKey,
      },
      style: 'road',
    });

    mapInstanceRef.current = map;

    // Wait for map to be ready
    map.events.add('ready', () => {
      //

      // Create data source
      const dataSource = new atlas.source.DataSource();
      map.sources.add(dataSource);
      dataSourceRef.current = dataSource;

      // Register custom icons
      const iconList = [
        'task-status-current.svg',
        'task-status-next.svg',
        'task-status-completed.svg',
        'Delivery Truck Icon.svg',
      ];
      iconList.forEach((icon) => {
        map.imageSprite.add(icon, `/${icon}`).catch(() => {});
      });

      // Symbol layer: use icon property from feature
      const symbolLayer = new atlas.layer.SymbolLayer(dataSource, undefined, {
        iconOptions: {
          allowOverlap: true,
          ignorePlacement: true,
          image: ['get', 'icon'],
        },
      });
      map.layers.add(symbolLayer);

      // Create popup
      const popup = new atlas.Popup({
        pixelOffset: [0, -18],
        closeButton: true,
      });
      popupRef.current = popup;

      // Add click event for pins
      map.events.add('click', symbolLayer, (e: any) => {
        if (e.shapes && e.shapes.length > 0) {
          const shape = e.shapes[0];
          const properties = shape.getProperties();
          const coordinates = shape.getCoordinates();

          let content = '<div style="padding: 10px;">';
          if (properties.kind === 'vehicle') {
            content += '<strong>Vehicle</strong><br/>';
            content += `Location: ${coordinates[1].toFixed(4)}, ${coordinates[0].toFixed(4)}`;
          } else {
            content += `<strong>Stop ${properties.stop_id || 'Unknown'}</strong><br/>`;
            content += `Status: ${properties.status || 'N/A'}<br/>`;
            content += `Location: ${coordinates[1].toFixed(4)}, ${coordinates[0].toFixed(4)}`;
          }
          content += '</div>';

          popup.setOptions({
            content,
            position: coordinates,
          });
          popup.open(map);
        }
      });

      // Initial data load
      updateMapData();
    });

    // Cleanup on unmount
    return () => {
      if (popupRef.current) {
        popupRef.current.close();
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.dispose();
        mapInstanceRef.current = null;
      }
    };
  }, []); // Only run once on mount

  // Update map data when stops or vehicle change
  const updateMapData = () => {
    if (!dataSourceRef.current) return;

    const features: atlas.data.Feature<atlas.data.Point, any>[] = [];

    // Add vehicle pin (always use Delivery Truck Icon.svg)
    if (vehicle?.last_location?.lat && vehicle?.last_location?.lon) {
      features.push(
        new atlas.data.Feature(
          new atlas.data.Point([vehicle.last_location.lon, vehicle.last_location.lat]),
          {
            kind: 'vehicle',
            icon: 'Delivery Truck Icon.svg',
          }
        )
      );
    }

    // Add stop pins with status-based icons
    stops.forEach((stop) => {
      let lat: number | undefined;
      let lon: number | undefined;

      // Try location first, then gps fallback
      if (stop.location?.lat && stop.location?.lon) {
        lat = stop.location.lat;
        lon = stop.location.lon;
      } else if ((stop as any).gps?.lat && (stop as any).gps?.lon) {
        lat = (stop as any).gps.lat;
        lon = (stop as any).gps.lon;
      }

      if (lat && lon) {
        let icon = 'task-status-next.svg';
        // Current executing stop
        if (currentStop && stop.stop_id === currentStop.stop_id) {
          icon = 'task-status-current.svg';
        } else if (String(stop.status).toLowerCase() === 'completed') {
          icon = 'task-status-completed.svg';
        }
        features.push(
          new atlas.data.Feature(new atlas.data.Point([lon, lat]), {
            kind: 'stop',
            stop_id: stop.stop_id,
            status: stop.status,
            icon,
          })
        );
      }
    });

    // Update data source
    dataSourceRef.current.clear();
    dataSourceRef.current.add(features);

    //
  };

  // Update data when stops or vehicle change
  useEffect(() => {
    if (mapInstanceRef.current && dataSourceRef.current) {
      updateMapData();
    }
  }, [stops, vehicle, currentStop]);

  return (
    <div
      style={{
        padding: 0,
        height: '100vh',
        boxSizing: 'border-box',
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Map Container */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {error ? (
          <div
            style={{
              color: '#dc2626',
              fontSize: '14px',
              padding: '16px',
              backgroundColor: '#fef2f2',
              borderRadius: '12px',
              textAlign: 'center',
              margin: '16px',
            }}
          >
            {error}
          </div>
        ) : (
          <div
            ref={mapRef}
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: '#e5e7eb',
            }}
          />
        )}

        {/* Navigate Current Stop CTA Button (P2 Design) */}
        <div
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '16px',
            right: '16px',
            zIndex: 100,
            // Respects mobile safe-area via padding; button remains full width
          }}
        >
          <button
            type="button"
            style={{
              // P2 design spec
              backgroundColor: '#2663EB',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 24, // Pill-style: radius ≥ half height
              padding: '16px 24px',
              fontSize: '16px',
              fontWeight: 600,
              cursor: 'pointer',
              width: '100%',
              textAlign: 'center',
              // Subtle elevation (optional, matches design system)
              boxShadow: '0 2px 8px rgba(38, 99, 235, 0.15)',
              transition: 'all 0.2s ease',
              // Prevent text selection during rapid taps
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
            onClick={() => {
              //
              // TODO: Implement navigation to next stop logic
            }}
            onMouseEnter={(e) => {
              // Subtle hover effect
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                '0 4px 12px rgba(38, 99, 235, 0.25)';
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow =
                '0 2px 8px rgba(38, 99, 235, 0.15)';
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
            }}
          >
            Navigate Current Stop
          </button>
        </div>
      </div>
    </div>
  );
}
