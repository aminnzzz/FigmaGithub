// Tokens.swift — GENERATED FILE; DO NOT EDIT
// Run `node generate-tokens-swift.js` to regenerate

import Foundation

public enum Tokens {
    public enum Color: String {
        public enum Background: String {
            public enum Level: String {
                case two = "#0A1A34"
            }
            case button = "#2FAAC2"
            case primary = "#2FAAC2"
            case secondary = "#0A1A34"
            case success = "#00A764"
        }
        public enum Button: String {
            public enum Label: String {
                case primary = "#FFFFFF"
            }
        }
    }
    public enum Font: String {
        public enum Family: String {
            case content = "TT Commons"
            case header = "TT Commons"
            case other = "TT Commons"
        }
        public enum Line: Double {
            public enum Height: Double {
                case 2xl = 40
                case 3xl = 48
                case 4xl = 64
                case lg = 28
                case md = 24
                case sm = 20
                case xl = 32
                case xs = 16
                case xxs = 14
            }
        }
        public enum Size: Double {
            case 2xl = 28
            case 3xl = 32
            case 4xl = 40
            case 5xl = 48
            case 6xl = 60
            case lg = 20
            case md = 18
            case sm = 16
            case xl = 24
            case xs = 14
            case xxs = 12
        }
        public enum Weight: String {
            case demiBold = "DemiBold"
            case medium = "Medium"
            case regular = "Regular"
        }
    }
    public enum Spacing: Double {
        public enum Padding: Double {
            case 2xl = 48
            case 3xl = 56
            case lg = 32
            case md = 24
            case none = 0
            case sm = 16
            case xl = 40
            case xs = 8
            case xxs = 4
        }
    }
    public enum Text: String {
        public enum Text: String {
            case brand = "#2FAAC2"
            case primary = "#FFFFFF"
            case secondary = "#BFCAD9"
        }
    }
}
