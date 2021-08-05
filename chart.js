async function drawChart() {
  // 1. Access data

  let dataset = await d3.json("./data/my_weather_data.json");

  const temperatureMinAccessor = (d) => d.temperatureMin;
  const temperatureMaxAccessor = (d) => d.temperatureMax;
  const uvAccessor = (d) => d.uvIndex;
  const precipitationProbabilityAccessor = (d) => d.precipProbability;
  const precipitationTypeAccessor = (d) => d.precipType;
  const cloudAccessor = (d) => d.cloudCover;
  const dateParser = d3.timeParse("%Y-%m-%d");
  const dateAccessor = (d) => dateParser(d.date);

  // 2. Create chart dimensions

  const width = 600;
  let dimensions = {
    width: width,
    height: width,
    radius: width / 2,
    margin: {
      top: 120,
      right: 120,
      bottom: 120,
      left: 120
    }
  };
  dimensions.boundedWidth =
    dimensions.width - dimensions.margin.left - dimensions.margin.right;
  dimensions.boundedHeight =
    dimensions.height - dimensions.margin.top - dimensions.margin.bottom;
  dimensions.boundedRadius =
    dimensions.radius - (dimensions.margin.left + dimensions.margin.right) / 2;

  // 3. Draw canvas

  const wrapper = d3
    .select("#wrapper")
    .append("svg")
    .attr("width", dimensions.width)
    .attr("height", dimensions.height);
  // 將bounds位移到第四象限
  const bounds = wrapper
    .append("g")
    .style(
      "transform",
      `translate(${dimensions.margin.left + dimensions.boundedRadius}px, ${
        dimensions.margin.top + dimensions.boundedRadius
      }px)`
    );
  // 定義放射形漸層
  const defs = wrapper.append("defs");
  const gradientId = "temperature-gradient";
  const gradient = defs.append("radialGradient").attr("id", gradientId);
  const numberOfStops = 10;
  const gradientColorScale = d3.interpolateYlOrRd;
  d3.range(numberOfStops).forEach((i) => {
    gradient
      .append("stop")
      .attr("offset", `${(i * 100) / (numberOfStops - 1)}%`)
      .attr("stop-color", gradientColorScale(i / (numberOfStops - 1)));
  });

  // 4. Create scales
  // 產生座標系統的容器
  const peripherals = bounds.append("g");
  // 產生月份的比例尺，輸出為弧度
  const angleScale = d3
    .scaleTime()
    .domain(d3.extent(dataset, dateAccessor))
    .range([0, Math.PI * 2]); // this is in radians

  // 先獲得且合併最低溫和最高溫陣列
  // 再用d3.extent()去最小值和最大值
  const radiusScale = d3
    .scaleLinear()
    .domain(
      d3.extent([
        ...dataset.map(temperatureMinAccessor),
        ...dataset.map(temperatureMaxAccessor)
      ])
    )
    .range([0, dimensions.boundedRadius])
    .nice();
  // 將弧度帶入，並計算出每一個月的(x,y)座標值
  const getCoordinatesForAngle = (angle, offset = 1) => [
    // 並將原本在第四象限的bounds減去90度，將起始範圍改為第一象限
    Math.cos(angle - Math.PI / 2) * dimensions.boundedRadius * offset,
    Math.sin(angle - Math.PI / 2) * dimensions.boundedRadius * offset
  ];

  const getXFromDataPoint = (d, offset = 1.4) =>
    getCoordinatesForAngle(angleScale(dateAccessor(d)), offset)[0];
  const getYFromDataPoint = (d, offset = 1.4) =>
    getCoordinatesForAngle(angleScale(dateAccessor(d)), offset)[1];

  // 利用面積變化呈現雲層覆蓋率，因為半徑每次差一倍，面積則是差平方倍
  // 因此使用scaleSqrt()非linear
  const cloudRadiusScale = d3
    .scaleSqrt()
    .domain(d3.extent(dataset, cloudAccessor))
    .range([1, 10]);

  const precipitationRadiusScale = d3
    .scaleSqrt()
    .domain(d3.extent(dataset, precipitationProbabilityAccessor))
    .range([0, 8]);

  // 因為是質性資料，因此採用順序性的比例尺
  const precipitationTypes = ["rain", "sleet", "snow"];
  const precipitationTypeColorScale = d3
    .scaleOrdinal()
    .domain(precipitationTypes)
    .range(["#54a0ff", "#636e72", "#b2bec3"]);

  const temperatureColorScale = d3
    .scaleSequential()
    .domain(
      d3.extent([
        ...dataset.map(temperatureMaxAccessor),
        ...dataset.map(temperatureMinAccessor)
      ])
    )
    .interpolator(gradientColorScale);
  // 5. Draw peripherals

  // 利用d3.timeMonths()將月份比例尺的輸入範圍，轉為陣列(原寫法為d3.timeMonths().range(arg))
  const months = d3.timeMonths(...angleScale.domain());

  // 將每一個月劃分一個圓，成為座標軸
  const gridLines = months.forEach((month) => {
    // 得出每個月的弧度
    const angle = angleScale(month);
    // 利用弧度和三角函數，得出每個月的座標值
    const [x, y] = getCoordinatesForAngle(angle);
    // 以(0,0)為原點增加每個月的端點並連
    peripherals
      .append("line")
      .attr("x2", x)
      .attr("y2", y)
      .attr("class", "grid-line");

    // 設定座標標記的位置
    const [labelX, labelY] = getCoordinatesForAngle(angle, 1.38);
    peripherals
      .append("text")
      .attr("x", labelX)
      .attr("y", labelY)
      .attr("class", "tick-label")
      .text(d3.timeFormat("%b")(month))
      .style(
        "text-anchor",
        Math.abs(labelX) < 5 ? "middle" : labelX > 0 ? "start" : "end"
      );
    // y軸上為middle; 第一、四象限為start; 第二、三象限為end
  });

  // 將溫度陣列分為四等分，但結果不會是完整包覆軸線[20,40,60,80]
  // 因此對raduisScale設定nice()，讓原本的陣列前後插入值[0,20,40,60,80,100]
  const temperatureTicks = radiusScale.ticks(4);
  // 增加分段的溫度同心圓
  const gridCircles = temperatureTicks.map((d) => {
    peripherals
      .append("circle")
      .attr("r", radiusScale(d))
      .attr("class", "grid-line");
  });
  // 增加溫度標記的背景
  const tickLabelBackgrounds = temperatureTicks.map((d) => {
    if (d < 1) return;
    return peripherals
      .append("rect")
      .attr("y", -radiusScale(d) - 10)
      .attr("width", 40)
      .attr("height", 20)
      .attr("fill", "#f8f9fa");
  });
  // 增加溫度標記
  const gridLabels = temperatureTicks.map((d) => {
    if (d < 1) return;
    return peripherals
      .append("text")
      .attr("x", 4)
      .attr("y", -radiusScale(d))
      .attr("class", "tick-label-temperature")
      .html(`${d3.format(".0f")(d)}&#176F`);
  });

  // 6. Draw data
  // 繪製華氏32度的範圍
  const freezingCircle = bounds
    .append("circle")
    .attr("r", radiusScale(32))
    .attr("class", "freezing-cicle");
  // 繪製每天的最低溫雨最高溫範圍
  const areaGenerator = d3
    .areaRadial()
    .angle((d) => angleScale(dateAccessor(d)))
    .innerRadius((d) => radiusScale(temperatureMinAccessor(d)))
    .outerRadius((d) => radiusScale(temperatureMaxAccessor(d)));

  const area = bounds
    .append("path")
    .attr("d", areaGenerator(dataset))
    .style("fill", `url(#${gradientId})`);

  // 繪製uv值 > 8的分佈天數
  const uvIndexThreshold = 8;
  const uvGroup = bounds.append("g");
  const uvOffset = 0.95;
  const highUvDays = uvGroup
    .selectAll("line")
    .data(dataset.filter((d) => uvAccessor(d) > uvIndexThreshold))
    .join("line")
    .attr("class", "uv-line")
    .attr("x1", (d) => getXFromDataPoint(d, uvOffset))
    .attr("x2", (d) => getXFromDataPoint(d, uvOffset + 0.1))
    .attr("y1", (d) => getYFromDataPoint(d, uvOffset))
    .attr("y2", (d) => getYFromDataPoint(d, uvOffset + 0.1));
  // 繪製每天的雲層覆蓋率
  const cloudGroup = bounds.append("g");
  const cloudOffset = 1.27;
  const cloudDots = cloudGroup
    .selectAll("circle")
    .data(dataset)
    .join("circle")
    .attr("cx", (d) => getXFromDataPoint(d, cloudOffset))
    .attr("cy", (d) => getYFromDataPoint(d, cloudOffset))
    .attr("r", (d) => cloudRadiusScale(cloudAccessor(d)))
    .attr("class", "cloud-dot");
  // 繪製每天的降雨量和天氣類型
  const precipitationGroup = bounds.append("g");
  const precipitationOffset = 1.14;
  const precipitationDots = precipitationGroup
    .selectAll("circle")
    .data(dataset)
    .join("circle")
    .attr("cx", (d) => getXFromDataPoint(d, precipitationOffset))
    .attr("cy", (d) => getYFromDataPoint(d, precipitationOffset))
    .attr("r", (d) =>
      precipitationRadiusScale(precipitationProbabilityAccessor(d))
    )
    .attr("fill", (d) =>
      precipitationTypeColorScale(precipitationTypeAccessor(d))
    )
    .attr("class", "precipitation-dot");
  // 7. Draw peripherals, part II
  const annotationGroup = bounds.append("g");

  const drawAnnottion = (angle, offset, text) => {
    const [x1, y1] = getCoordinatesForAngle(angle, offset);
    const [x2, y2] = getCoordinatesForAngle(angle, 1.6);

    annotationGroup
      .append("line")
      .attr("x1", x1)
      .attr("x2", x2)
      .attr("y1", y1)
      .attr("y2", y2)
      .attr("class", "annotation-line");
    annotationGroup
      .append("text")
      .attr("x", x2 + 6)
      .attr("y", y2)
      .attr("class", "annotation-text")
      .text(text);
  };
  drawAnnottion(Math.PI * 0.23, cloudOffset, "Cloud Cover");
  drawAnnottion(Math.PI * 0.26, precipitationOffset, "Precipitation");
  drawAnnottion(Math.PI * 0.734, uvOffset, `UV Index over ${uvIndexThreshold}`);
  drawAnnottion(Math.PI * 0.7, 0.5, "Temperature");
  drawAnnottion(
    Math.PI * 0.9,
    radiusScale(32) / dimensions.boundedRadius,
    "Freezing Temperature"
  );

  precipitationTypes.forEach((precipitationType, index) => {
    const labelCoordinates = getCoordinatesForAngle(Math.PI * 0.26, 1.6);
    annotationGroup
      .append("circle")
      .attr("cx", labelCoordinates[0] + 15)
      .attr("cy", labelCoordinates[1] + 16 * (index + 1))
      .attr("r", 4)
      .attr("fill", precipitationTypeColorScale(precipitationType))
      .style("opacity", 0.7);
    annotationGroup
      .append("text")
      .attr("x", labelCoordinates[0] + 25)
      .attr("y", labelCoordinates[1] + 16 * (index + 1))
      .text(precipitationType)
      .attr("class", "annotation-text");
  });
  // 8. Set up interactions
  const tooltip = d3.select("#tooltip");
  const tooltipLine = bounds.append("path").attr("class", "tooltip-line");
  const onMouseMove = (e) => {
    // 回傳游標(x,y)
    const [x, y] = d3.pointer(e);
    const getAngleFromCoordinates = (x, y) => Math.atan2(y, x);
    let angle = getAngleFromCoordinates(x, y) + Math.PI / 2;
    if (angle < 0) angle = Math.PI * 2 + angle;
    const tooltipArcGenerator = d3
      .arc()
      .innerRadius(0)
      .outerRadius(dimensions.boundedRadius * 1.6)
      .startAngle(angle - 0.015)
      .endAngle(angle + 0.015);

    tooltipLine.attr("d", tooltipArcGenerator()).style("opacity", 1);

    tooltip.style("opacity", 1);
    const outerCoordinates = getCoordinatesForAngle(angle, 1.6);
    tooltip
      .style("opacity", 1)
      .style(
        "transform",
        `translate(calc(${
          outerCoordinates[0] < -50
            ? "40px - 100"
            : outerCoordinates[0] > 50
            ? "-40px + 0"
            : "-50"
        }% + ${
          outerCoordinates[0] + dimensions.margin.top + dimensions.boundedRadius
        }px), calc(${
          outerCoordinates[1] < -50
            ? "40px - 100"
            : outerCoordinates[1] > 50
            ? "-40px + 0"
            : "-50"
        }% + ${
          outerCoordinates[1] + dimensions.margin.top + dimensions.boundedRadius
        }px))`
      );
    const date = angleScale.invert(angle);
    const dateString = d3.timeFormat("%Y-%m-%d")(date);
    const dataPoint = dataset.find((d) => d.date == dateString);
    if (!dataPoint) return;

    tooltip.select("#tooltip-date").text(d3.timeFormat("%B %-d")(date));
    tooltip
      .select("#tooltip-temperature-min")
      .html(`${d3.format(".1f")(temperatureMinAccessor(dataPoint))}°F`)
      .style("color", temperatureColorScale(temperatureMinAccessor(dataPoint)));
    tooltip
      .select("#tooltip-temperature-max")
      .html(`${d3.format(".1f")(temperatureMaxAccessor(dataPoint))}°F`)
      .style("color", temperatureColorScale(temperatureMaxAccessor(dataPoint)));
    tooltip.select("#tooltip-uv").text(uvAccessor(dataPoint));
    tooltip.select("#tooltip-cloud").text(cloudAccessor(dataPoint));
    tooltip
      .select("#tooltip-precipitation")
      .text(d3.format(".0%")(precipitationProbabilityAccessor(dataPoint)));
    tooltip
      .select("#tooltip-precipitation-type")
      .text(precipitationTypeAccessor(dataPoint));
    tooltip
      .select(".tooltip-precipitation-type")
      .style(
        "color",
        precipitationTypeAccessor(dataPoint)
          ? precipitationTypeColorScale(precipitationTypeAccessor(dataPoint))
          : "#dadadd"
      );
  };
  const onMouseLeave = () => {
    tooltip.style("opacity", 0);
    tooltipLine.style("opacity", 0);
  };
  const listenerCircle = bounds
    .append("circle")
    .attr("r", dimensions.width / 2)
    .attr("class", "listener-circle")
    .on("mousemove", onMouseMove)
    .on("mouseleave", onMouseLeave);
}
drawChart();
