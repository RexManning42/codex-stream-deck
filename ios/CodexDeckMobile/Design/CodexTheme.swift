import SwiftUI

enum CodexTheme {
  static let canvas = Color(red: 0.945, green: 0.95, blue: 0.955)
  static let panel = Color(red: 0.88, green: 0.895, blue: 0.91)
  static let key = Color.white.opacity(0.92)
  static let ink = Color(red: 0.08, green: 0.09, blue: 0.10)
  static let secondary = Color(red: 0.40, green: 0.43, blue: 0.47)
  static let green = Color(red: 0.18, green: 0.83, blue: 0.44)
  static let blue = Color(red: 0.13, green: 0.53, blue: 0.98)
  static let orange = Color(red: 1.0, green: 0.61, blue: 0.13)
  static let red = Color(red: 1.0, green: 0.27, blue: 0.36)

  static func statusColor(_ status: String) -> Color {
    if ["working", "thinking"].contains(status) { return blue }
    if ["approval", "awaiting-approval", "awaiting-response"].contains(status) { return orange }
    if ["unread", "complete", "completed", "done"].contains(status) { return green }
    if status == "error" { return red }
    return secondary.opacity(0.55)
  }
}

struct HardwareKeyStyle: ButtonStyle {
  var tint: Color = CodexTheme.ink

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .foregroundStyle(tint)
      .frame(maxWidth: .infinity, minHeight: 62)
      .background(
        RoundedRectangle(cornerRadius: 20, style: .continuous)
          .fill(CodexTheme.key.opacity(configuration.isPressed ? 0.72 : 1))
          .shadow(color: .white.opacity(0.9), radius: 0, x: 0, y: -2)
          .shadow(
            color: .black.opacity(configuration.isPressed ? 0.08 : 0.16),
            radius: configuration.isPressed ? 2 : 8, y: configuration.isPressed ? 1 : 5)
      )
      .overlay(
        RoundedRectangle(cornerRadius: 20, style: .continuous)
          .stroke(.white.opacity(0.72), lineWidth: 1)
      )
      .scaleEffect(configuration.isPressed ? 0.97 : 1)
      .animation(.snappy(duration: 0.15), value: configuration.isPressed)
  }
}

struct SectionLabel: View {
  let title: String
  let detail: String?

  init(_ title: String, detail: String? = nil) {
    self.title = title
    self.detail = detail
  }

  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      Text(title.uppercased())
        .font(.caption.weight(.bold))
        .tracking(1.5)
        .foregroundStyle(CodexTheme.secondary)
      Spacer()
      if let detail { Text(detail).font(.caption).foregroundStyle(.secondary) }
    }
  }
}
