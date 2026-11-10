package ai.ourcar.alive.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// 낮·밤 모드는 시스템(Pleos)을 따른다. 글자 대비 4.5:1 이상, 차 화면이라 글자를 크게.
private val Night = darkColorScheme(
    primary = Color(0xFF6CB4FF), onPrimary = Color(0xFF00213F),
    background = Color(0xFF0B0D10), onBackground = Color(0xFFF2F4F7),
    surface = Color(0xFF16191E), onSurface = Color(0xFFF2F4F7),
    surfaceVariant = Color(0xFF22262D), onSurfaceVariant = Color(0xFFC4CAD3),
    error = Color(0xFFFF8A80), onError = Color(0xFF3B0000),
    errorContainer = Color(0xFF4A1C1C), onErrorContainer = Color(0xFFFFDAD6),
)

private val Day = lightColorScheme(
    primary = Color(0xFF0B57D0), onPrimary = Color.White,
    background = Color(0xFFF3F5F8), onBackground = Color(0xFF12151A),
    surface = Color.White, onSurface = Color(0xFF12151A),
    surfaceVariant = Color(0xFFE6EAF0), onSurfaceVariant = Color(0xFF424852),
    error = Color(0xFFB3261E), onError = Color.White,
    errorContainer = Color(0xFFFFDAD6), onErrorContainer = Color(0xFF410002),
)

private val CarType = Typography(
    headlineLarge = TextStyle(fontSize = 40.sp, fontWeight = FontWeight.Bold, lineHeight = 48.sp),
    headlineMedium = TextStyle(fontSize = 32.sp, fontWeight = FontWeight.Bold, lineHeight = 40.sp),
    titleLarge = TextStyle(fontSize = 28.sp, fontWeight = FontWeight.SemiBold, lineHeight = 36.sp),
    titleMedium = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.SemiBold, lineHeight = 32.sp),
    bodyLarge = TextStyle(fontSize = 24.sp, lineHeight = 34.sp),
    bodyMedium = TextStyle(fontSize = 20.sp, lineHeight = 28.sp),
    labelLarge = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.SemiBold),
    labelMedium = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.Medium),
)

@Composable
fun OurCarTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) Night else Day, typography = CarType, content = content)
}
