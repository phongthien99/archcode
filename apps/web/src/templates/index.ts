import documentPlatform from '../../../../fixtures/document-platform.yaml?raw';
import ecommerce from './ecommerce-microservices.yaml?raw';
import eventDriven from './event-driven.yaml?raw';

export interface Template {
  id: string;
  name: string;
  description: string;
  fileName: string;
  text: string;
}

export const TEMPLATES: Template[] = [
  {
    id: 'document-platform',
    name: 'Document Platform',
    description: 'Hệ thống upload tài liệu: gateway, service, DB, object storage, queue',
    fileName: 'document-platform.yaml',
    text: documentPlatform,
  },
  {
    id: 'ecommerce',
    name: 'E-commerce microservices',
    description: 'Database per service, event bus Kafka, rule cấm truy cập DB khác domain',
    fileName: 'ecommerce.yaml',
    text: ecommerce,
  },
  {
    id: 'event-driven',
    name: 'Event-driven (IoT)',
    description: 'MQTT → Kafka → các consumer độc lập',
    fileName: 'iot-telemetry.yaml',
    text: eventDriven,
  },
];

/** Mẫu trống: chỉ có system — tạo sơ đồ bằng cách kéo component từ palette vào canvas. */
export const BLANK_TEMPLATE = `# Kéo component từ palette vào canvas, nối bằng chấm tròn ở cạnh node.
version: 1

system:
  id: my-system
  name: Hệ thống của tôi
`;
