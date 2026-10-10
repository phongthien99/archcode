import { useApp } from '../store';

/** Xóa phần tử đang chọn; hỏi xác nhận nếu còn được tham chiếu trong views/rules (S4-EDIT-05). */
export async function deleteSelection(): Promise<void> {
  const { selection, dispatch, select } = useApp.getState();
  if (
    !selection ||
    selection.kind === 'system' ||
    selection.kind === 'view' ||
    selection.kind === 'rule'
  )
    return;
  const command =
    selection.kind === 'component'
      ? ({ type: 'deleteComponent', id: selection.id } as const)
      : selection.kind === 'group'
        ? ({ type: 'deleteGroup', id: selection.id } as const)
        : ({ type: 'deleteRelationship', id: selection.id } as const);
  const result = await dispatch(command, {
    confirm: (r) => {
      if (!r.references.length) return true;
      const list = r.references.map(
        (ref) =>
          `• ${ref.kind === 'view' ? 'View' : 'Rule'} "${ref.id}": ${ref.value} (dòng ${ref.line})`,
      );
      return confirm(
        `"${selection.id}" vẫn được tham chiếu ở:\n${list.join('\n')}\n\nVẫn xóa? Các tham chiếu này sẽ báo lỗi cho tới khi bạn sửa.`,
      );
    },
  });
  if (result?.ok) select(null, 'canvas');
}
