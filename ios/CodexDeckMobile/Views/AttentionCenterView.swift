import SwiftUI

struct AttentionCenterView: View {
  @Environment(DashboardStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var filter: AttentionFilter = .all
  @State private var selectedReference: AgentReference?
  @State private var confirmingClear = false

  private var events: [AttentionEvent] {
    store.attentionEvents.filter(filter.includes)
  }

  var body: some View {
    NavigationStack {
      ZStack {
        CodexBackdrop(accent: store.unreadAttentionCount > 0 ? CodexTheme.orange : CodexTheme.blue)
          .ignoresSafeArea()

        VStack(spacing: 0) {
          filters
          if events.isEmpty {
            ContentUnavailableView {
              Label(emptyTitle, systemImage: "bell.slash")
            } description: {
              Text(emptyDetail)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
          } else {
            ScrollView {
              LazyVStack(spacing: 11) {
                ForEach(events) { event in
                  AttentionEventRow(event: event) {
                    store.markAttentionRead(event.id)
                    selectedReference = event.reference
                  }
                }
              }
              .padding(.horizontal, 16)
              .padding(.vertical, 14)
            }
            .scrollIndicators(.hidden)
          }
        }
      }
      .navigationTitle("Attention")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Done") { dismiss() }
        }
        ToolbarItemGroup(placement: .primaryAction) {
          if store.unreadAttentionCount > 0 {
            Button("Mark all read", systemImage: "checkmark.circle") {
              store.markAllAttentionRead()
            }
          }
          if !store.attentionEvents.isEmpty {
            Button("Clear", systemImage: "trash", role: .destructive) {
              confirmingClear = true
            }
          }
        }
      }
      .confirmationDialog("Clear attention history?", isPresented: $confirmingClear) {
        Button("Clear history", role: .destructive) { store.clearAttentionEvents() }
      } message: {
        Text("This removes only the notification history stored on this iPhone.")
      }
      .sheet(item: $selectedReference) { reference in
        AgentDetailView(reference: reference)
          .presentationDetents([.medium, .large])
          .presentationDragIndicator(.visible)
          .presentationCornerRadius(34)
          .presentationBackground(.clear)
      }
    }
  }

  private var filters: some View {
    ScrollView(.horizontal) {
      CodexGlassGroup(spacing: 8) {
        HStack(spacing: 8) {
          ForEach(AttentionFilter.allCases) { item in
            Button {
              withAnimation(.snappy(duration: 0.22)) { filter = item }
            } label: {
              Text(item.title)
                .font(.caption.weight(.bold))
                .foregroundStyle(filter == item ? Color.white : CodexTheme.ink)
                .padding(.horizontal, 13)
                .padding(.vertical, 8)
                .background(filter == item ? CodexTheme.control : Color.clear, in: Capsule())
                .codexGlassSurface(cornerRadius: 18, interactive: true)
            }
            .buttonStyle(.plain)
          }
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 10)
    }
    .scrollIndicators(.hidden)
  }

  private var emptyTitle: String {
    filter == .all ? "Nothing needs attention" : "No matching events"
  }

  private var emptyDetail: String {
    filter == .all
      ? "Approvals, replies, completions, errors, and unread task updates appear here."
      : "Try another filter or wait for a new Codex update."
  }
}

private struct AttentionEventRow: View {
  let event: AttentionEvent
  let open: () -> Void

  var body: some View {
    Button(action: open) {
      HStack(spacing: 13) {
        ZStack {
          Circle().fill(tint.opacity(event.isRead ? 0.08 : 0.15))
          Image(systemName: event.kind.symbol)
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(tint.opacity(event.isRead ? 0.58 : 1))
        }
        .frame(width: 42, height: 42)

        VStack(alignment: .leading, spacing: 4) {
          HStack(spacing: 6) {
            Text(event.kind.title)
              .font(.caption.weight(.bold))
              .foregroundStyle(tint)
            if !event.isRead {
              Circle().fill(tint).frame(width: 6, height: 6)
            }
          }
          Text(event.title)
            .font(.subheadline.weight(event.isRead ? .medium : .bold))
            .foregroundStyle(CodexTheme.ink.opacity(event.isRead ? 0.68 : 1))
            .lineLimit(2)
          HStack(spacing: 5) {
            Text(event.platform.shortLabel)
              .font(.system(size: 8, weight: .black))
              .foregroundStyle(.white)
              .frame(width: 18, height: 18)
              .background(CodexTheme.control, in: Circle())
            Text(event.hostName)
            Text("·")
            Text(event.occurredAt.formatted(.relative(presentation: .numeric)))
          }
          .font(.caption2)
          .foregroundStyle(CodexTheme.secondary)
        }
        Spacer(minLength: 5)
        Image(systemName: "chevron.right")
          .font(.caption.weight(.bold))
          .foregroundStyle(CodexTheme.secondary.opacity(0.7))
      }
      .padding(14)
      .contentShape(Rectangle())
      .codexGlassSurface(cornerRadius: 21, tint: tint.opacity(event.isRead ? 0.025 : 0.07), interactive: true)
    }
    .buttonStyle(.plain)
    .accessibilityLabel("\(event.kind.title), \(event.title), \(event.platform.displayName)")
  }

  private var tint: Color {
    switch event.kind {
    case .approval, .response: CodexTheme.orange
    case .completion, .unread: CodexTheme.green
    case .error: CodexTheme.red
    }
  }
}
