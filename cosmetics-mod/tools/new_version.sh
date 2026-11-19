#!/usr/bin/env bash
# 사용법: tools/new_version.sh <폴더이름> <빌드할 MC 버전> <yarn 버전> <java 버전> <minecraft 버전 범위>
set -e
D=versions/$1
mkdir -p $D/src/main/java/dev/aurora/cosmetics/mixin $D/src/main/resources
cat > $D/settings.gradle <<G
pluginManagement { repositories { maven { url = 'https://maven.fabricmc.net/' }; mavenCentral(); gradlePluginPortal() } }
rootProject.name = 'aurora-cosmetics-$1'
G
cat > $D/gradle.properties <<G
org.gradle.jvmargs=-Xmx2G
minecraft_version=$2
yarn_mappings=$3
loader_version=0.16.14
java_version=$4
mc_range=$5
G
cat > $D/build.gradle <<'G'
plugins { id 'fabric-loom' version '1.11-SNAPSHOT' }
base { archivesName = "aurora-cosmetics-${project.name.replace('aurora-cosmetics-', '')}" }
version = '1.0.0'
// Mojang 라이브러리 저장소를 먼저 (Maven Central 이 요청 제한을 걸 때 대비)
repositories { maven { url = 'https://libraries.minecraft.net/' } }
sourceSets.main.java.srcDirs += '../../common/src/main/java'
sourceSets.main.resources.srcDirs += '../../common/src/main/resources'
dependencies {
  minecraft "com.mojang:minecraft:${project.minecraft_version}"
  mappings "net.fabricmc:yarn:${project.yarn_mappings}:v2"
  modImplementation "net.fabricmc:fabric-loader:${project.loader_version}"
}
processResources {
  inputs.property 'range', project.mc_range
  filesMatching('fabric.mod.json') { expand 'mc_range': project.mc_range, 'java': project.java_version }
}
// 믹스인 호환 수준(JAVA_17)과 맞춤
tasks.withType(JavaCompile).configureEach { it.options.release = 17; it.options.encoding = 'UTF-8' }
G
cat > $D/src/main/resources/fabric.mod.json <<'G'
{
  "schemaVersion": 1,
  "id": "aurora_cosmetics",
  "version": "1.0.0",
  "name": "Aurora Cosmetics",
  "description": "Aurora Launcher 에서 고른 치장품을 내 캐릭터에 그려 줍니다. 내 화면에서만 보입니다.",
  "authors": ["Aurora Launcher"],
  "license": "MIT",
  "environment": "client",
  "mixins": ["aurora_cosmetics.mixins.json"],
  "depends": { "fabricloader": ">=0.14.0", "minecraft": "${mc_range}", "java": ">=${java}" }
}
G
echo "created $D"
