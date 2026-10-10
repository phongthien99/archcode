/**
 * Danh mục mã lỗi. Mã là một phần của API công khai (CLI JSON output, CI),
 * không đổi tên mã đã phát hành.
 */
export const DIAGNOSTIC_CODES = {
  // YAML
  'yaml-syntax': 'YAML sai cú pháp',
  'yaml-warning': 'Cảnh báo từ trình đọc YAML',
  'empty-document': 'File rỗng hoặc gốc không phải object',

  // Schema
  'schema-required': 'Thiếu trường bắt buộc',
  'schema-type': 'Sai kiểu dữ liệu',
  'schema-enum': 'Giá trị không thuộc danh sách cho phép',
  'schema-pattern': 'Giá trị sai định dạng',
  'schema-unknown-field': 'Trường không được hỗ trợ',
  'schema-invalid': 'Dữ liệu không khớp schema',
  'unsupported-version': 'Phiên bản schema không được hỗ trợ',
  'ambiguous-section': 'Một mục được khai báo ở hai nơi',

  // Semantic
  'duplicate-id': 'ID bị trùng',
  'unknown-reference': 'Tham chiếu tới ID không tồn tại',
  'invalid-reference': 'Tham chiếu tới sai loại đối tượng',
  'self-loop': 'Quan hệ trỏ vào chính nó',
  'unknown-component-type': 'Loại component chưa được định nghĩa',
  'group-cycle': 'Group lồng nhau tạo thành vòng',
  'invalid-selector': 'Selector của view không hợp lệ',
  'empty-selector': 'Selector của view không khớp component nào',
  'empty-view': 'View không có component nào',
  'invalid-rule': 'Rule khai báo thiếu thông tin',

  // Rule kiến trúc
  'circular-dependency': 'Vòng phụ thuộc giữa các component',
  'orphan-component': 'Component không có quan hệ nào',
  'forbidden-dependency': 'Quan hệ bị cấm bởi rule',

  // File layout
  'layout-invalid': 'File layout sai định dạng',
  'layout-unknown-id': 'File layout tham chiếu tới phần tử không tồn tại',
} as const;

export type DiagnosticCode = keyof typeof DIAGNOSTIC_CODES;
