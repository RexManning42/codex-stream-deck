#!/usr/bin/env swift
import AppKit

let size = NSSize(width: 1024, height: 1024)
guard
  let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: 1024,
    pixelsHigh: 1024,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  )
else { fatalError("Could not create icon bitmap") }
bitmap.size = size
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
guard let context = NSGraphicsContext.current?.cgContext else { fatalError("No graphics context") }

func color(_ hex: UInt32, alpha: CGFloat = 1) -> NSColor {
  NSColor(
    calibratedRed: CGFloat((hex >> 16) & 0xff) / 255,
    green: CGFloat((hex >> 8) & 0xff) / 255,
    blue: CGFloat(hex & 0xff) / 255,
    alpha: alpha
  )
}

func rounded(
  _ rect: CGRect, radius: CGFloat, fill: NSColor, stroke: NSColor? = nil, width: CGFloat = 0
) {
  let path = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
  fill.setFill()
  path.fill()
  if let stroke {
    stroke.setStroke()
    path.lineWidth = width
    path.stroke()
  }
}

let background = CGGradient(
  colorsSpace: CGColorSpaceCreateDeviceRGB(),
  colors: [color(0xF7F8F8).cgColor, color(0xDCE4EA).cgColor] as CFArray,
  locations: [0, 1]
)!
context.drawLinearGradient(
  background,
  start: CGPoint(x: 180, y: 920),
  end: CGPoint(x: 850, y: 80),
  options: [.drawsBeforeStartLocation, .drawsAfterEndLocation]
)

context.saveGState()
context.setShadow(
  offset: CGSize(width: 0, height: -22), blur: 42, color: color(0x121417, alpha: 0.22).cgColor)
rounded(CGRect(x: 128, y: 128, width: 768, height: 768), radius: 190, fill: color(0xE8EDF0))
context.restoreGState()

rounded(
  CGRect(x: 154, y: 154, width: 716, height: 716),
  radius: 166,
  fill: color(0x25282B),
  stroke: color(0xFFFFFF, alpha: 0.58),
  width: 8
)

let keySize: CGFloat = 170
let gap: CGFloat = 28
let startX: CGFloat = 215
let startY: CGFloat = 482
let statusColors: [UInt32] = [0x2588FA, 0x30D96F, 0xFF9C20, 0x30D96F, 0x2588FA, 0x737A80]

for row in 0..<2 {
  for column in 0..<3 {
    let index = row * 3 + column
    let x = startX + CGFloat(column) * (keySize + gap)
    let y = startY - CGFloat(row) * (keySize + gap)
    let keyRect = CGRect(x: x, y: y, width: keySize, height: keySize)
    context.saveGState()
    context.setShadow(
      offset: CGSize(width: 0, height: -10), blur: 16, color: color(0x000000, alpha: 0.35).cgColor)
    rounded(
      keyRect, radius: 48, fill: color(0xF7F8F8), stroke: color(0xFFFFFF, alpha: 0.85), width: 5)
    context.restoreGState()

    let dot = CGRect(x: keyRect.midX - 24, y: keyRect.midY - 24, width: 48, height: 48)
    color(statusColors[index]).setFill()
    NSBezierPath(ovalIn: dot).fill()
  }
}

// Two private host lanes converge on the same six-slot control surface.
for (start, tint, firstControl): (CGPoint, UInt32, CGPoint) in [
  (CGPoint(x: 278, y: 226), 0x2588FA, CGPoint(x: 370, y: 226)),
  (CGPoint(x: 746, y: 226), 0x30D96F, CGPoint(x: 654, y: 226)),
] {
  let lane = NSBezierPath()
  lane.move(to: start)
  lane.curve(
    to: CGPoint(x: 512, y: 218), controlPoint1: firstControl,
    controlPoint2: CGPoint(x: 452 + (start.x > 512 ? 120 : 0), y: 218))
  lane.lineWidth = 22
  lane.lineCapStyle = .round
  color(tint).setStroke()
  lane.stroke()
}

let uplink = NSBezierPath()
uplink.move(to: CGPoint(x: 512, y: 218))
uplink.line(to: CGPoint(x: 512, y: 264))
uplink.lineWidth = 18
uplink.lineCapStyle = .round
color(0xF7F8F8).setStroke()
uplink.stroke()

for (x, tint): (Double, UInt32) in [(278, 0x2588FA), (746, 0x30D96F)] {
  color(tint).setFill()
  NSBezierPath(ovalIn: CGRect(x: x - 18, y: 208, width: 36, height: 36)).fill()
}

NSGraphicsContext.restoreGraphicsState()
guard let png = bitmap.representation(using: .png, properties: [:]) else {
  fatalError("Could not encode icon")
}

let destination =
  CommandLine.arguments.dropFirst().first
  ?? "ios/CodexDeckMobile/Assets.xcassets/AppIcon.appiconset/AppIcon.png"
try FileManager.default.createDirectory(
  at: URL(fileURLWithPath: destination).deletingLastPathComponent(),
  withIntermediateDirectories: true)
try png.write(to: URL(fileURLWithPath: destination), options: .atomic)
print(destination)
