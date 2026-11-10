package ai.ourcar.alive.ui

import ai.ourcar.alive.logic.Mood
import ai.ourcar.alive.store.EyeStyle
import ai.ourcar.alive.store.Look
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke

/** 얼굴 화면 비율 (가로 512 : 세로 200, 웹 앱 3D 얼굴과 같은 좌표) */
const val FACE_ASPECT = 512f / 200f

/**
 * 차 앞 스크린 얼굴. 기분 7종 + 꾸미기(눈 모양 · 얼굴 빛 · 볼터치).
 * 웹 앱 src/three/face.ts 를 옮김. 움직임 없는 그림이라 주행 중에도 눈을 끌지 않는다.
 */
@Composable
fun Face(mood: Mood, look: Look, modifier: Modifier = Modifier) {
    val color = Color(look.glow.argb)
    Canvas(modifier.aspectRatio(FACE_ASPECT)) {
        drawRoundRect(Color(0xFF050608), cornerRadius = androidx.compose.ui.geometry.CornerRadius(size.height * 0.12f))
        val s = size.width / 512f
        FacePainter(this, s, color).draw(mood, look)
    }
}

private class FacePainter(val d: DrawScope, val s: Float, val c: Color) {
    val el = 512 * 0.3f
    val er = 512 * 0.7f
    val ey = 200 * 0.42f
    val mx = 256f
    val my = 200 * 0.76f

    private fun o(x: Float, y: Float) = Offset(x * s, y * s)

    /** 빛나는 선: 넓고 옅은 선 위에 진한 선 */
    private fun stroke(path: Path, w: Float = 14f) {
        d.drawPath(path, c.copy(alpha = 0.22f), style = Stroke(width = (w + 14) * s, cap = StrokeCap.Round, join = StrokeJoin.Round))
        d.drawPath(path, c, style = Stroke(width = w * s, cap = StrokeCap.Round, join = StrokeJoin.Round))
    }

    private fun fill(path: Path) = d.drawPath(path, c)

    private fun arc(cx: Float, cy: Float, r: Float, fromDeg: Float, sweepDeg: Float) = Path().apply {
        arcTo(androidx.compose.ui.geometry.Rect(o(cx - r, cy - r), Size(2 * r * s, 2 * r * s)), fromDeg, sweepDeg, true)
    }

    private fun line(vararg pts: Pair<Float, Float>) = Path().apply {
        moveTo(pts[0].first * s, pts[0].second * s)
        pts.drop(1).forEach { lineTo(it.first * s, it.second * s) }
    }

    private fun dot(x: Float, y: Float, r: Float, color: Color = c) = d.drawCircle(color, r * s, o(x, y))

    private fun ring(x: Float, look: Float = 0f) {
        stroke(arc(x, ey, 34f, 0f, 359.9f))
        dot(x + 8 + look * 8, ey - 8, 9f)
    }

    fun draw(mood: Mood, look: Look) {
        val calmish = mood == Mood.HAPPY || mood == Mood.CALM
        if (calmish && look.eye != EyeStyle.CLASSIC) {
            listOf(el, er).forEach { x ->
                when (look.eye) {
                    EyeStyle.DOT -> d.drawOval(c, o(x - 15, ey + 4 - 19), Size(30 * s, 38 * s))
                    else -> {
                        val r = if (look.eye == EyeStyle.SPARKLE) 38f else 31f
                        dot(x, ey + 2, r)
                        dot(x + r * 0.32f, ey - r * 0.3f, r * 0.3f, Color(0xFF050608))
                        if (look.eye == EyeStyle.SPARKLE) dot(x - r * 0.35f, ey + r * 0.38f, r * 0.14f, Color(0xFF050608))
                    }
                }
            }
        } else when (mood) {
            Mood.HAPPY -> listOf(el, er).forEach { stroke(arc(it, ey + 16, 30f, 198f, 144f)) }
            Mood.EXCITED -> listOf(el, er).forEach { x ->
                val r = 36f
                fill(Path().apply {
                    moveTo(x * s, (ey - r) * s)
                    quadraticTo((x + 6) * s, (ey - 6) * s, (x + r) * s, ey * s)
                    quadraticTo((x + 6) * s, (ey + 6) * s, x * s, (ey + r) * s)
                    quadraticTo((x - 6) * s, (ey + 6) * s, (x - r) * s, ey * s)
                    quadraticTo((x - 6) * s, (ey - 6) * s, x * s, (ey - r) * s)
                })
            }
            Mood.HUNGRY -> { ring(el, -1f); ring(er, -1f) }
            Mood.SICK -> {
                stroke(line(el - 26 to ey - 22, el + 20 to ey, el - 26 to ey + 22))
                stroke(line(er + 26 to ey - 22, er - 20 to ey, er + 26 to ey + 22))
            }
            Mood.TIRED -> listOf(el, er).forEach { x ->
                stroke(line(x - 34 to ey, x + 34 to ey))
                stroke(arc(x, ey, 30f, 8.6f, 162.8f))
            }
            Mood.SLEEPY -> {
                listOf(el, er).forEach { stroke(arc(it, ey - 18, 30f, 27f, 126f)) }
                stroke(line(440f to 56f, 462f to 56f, 440f to 78f, 462f to 78f), 6f) // z
            }
            Mood.CALM -> { ring(el); ring(er) }
        }

        if (look.blush && mood != Mood.SICK) {
            listOf(el - 46, er + 46).forEach { x ->
                d.drawOval(Color(0x99FF78AA), o(x - 26, ey + 46 - 12), Size(52 * s, 24 * s))
            }
        }

        when (mood) {
            Mood.HAPPY -> stroke(arc(mx, my - 22, 26f, 36f, 108f))
            Mood.EXCITED -> fill(Path().apply {
                moveTo((mx - 30) * s, (my - 14) * s)
                quadraticTo(mx * s, (my + 30) * s, (mx + 30) * s, (my - 14) * s)
                close()
            })
            Mood.HUNGRY -> {
                stroke(Path().apply { addOval(androidx.compose.ui.geometry.Rect(o(mx - 16, my - 15), Size(32 * s, 26 * s))) })
                d.drawPath(Path().apply {
                    moveTo((mx + 26) * s, (my - 4) * s)
                    quadraticTo((mx + 36) * s, (my + 12) * s, (mx + 26) * s, (my + 18) * s)
                    quadraticTo((mx + 16) * s, (my + 12) * s, (mx + 26) * s, (my - 4) * s)
                }, Color(0xFF9FE6FF))
            }
            Mood.SICK, Mood.TIRED -> stroke(Path().apply {
                moveTo((mx - 34) * s, my * s)
                for (i in 0 until 4) quadraticTo((mx - 25 + i * 17) * s, (my + if (i % 2 == 1) 12 else -12) * s, (mx - 17 + i * 17) * s, my * s)
            })
            Mood.SLEEPY -> stroke(Path().apply { addOval(androidx.compose.ui.geometry.Rect(o(mx - 9, my - 8), Size(18 * s, 16 * s))) })
            Mood.CALM -> stroke(arc(mx, my - 18, 22f, 36f, 108f))
        }
    }
}
