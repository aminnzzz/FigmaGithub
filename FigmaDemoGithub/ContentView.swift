//
//  ContentView.swift
//  FigmaDemoGithub
//
//  Created by amin nazemzadeh on 4/17/25.
//

import SwiftUI

struct ContentView: View {
    var body: some View {
        ZStack {
            VStack(spacing: 20) {
                Image(systemName: "globe")
                    .imageScale(.large)
                    .font(.system(size: 60))
                    .foregroundStyle(.white)
            }
            .padding()
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .shadow(radius: 10)
        }
    }
}

#Preview {
    ContentView()
}
