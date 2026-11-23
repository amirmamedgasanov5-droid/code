import SwiftUI

struct ContentView: View {
    @AppStorage("count") private var count = 0

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 32) {
                Text("\(count)").font(.system(size: 96, weight: .thin)).foregroundColor(.white)
                HStack(spacing: 16) {
                    pill("−") { count -= 1 }
                    pill("+") { count += 1 }
                }
            }
        }
    }

    private func pill(_ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label).font(.system(size: 28)).foregroundColor(.white)
                .frame(width: 84, height: 84)
                .overlay(Rectangle().stroke(Color.white, lineWidth: 1))
        }
    }
}
