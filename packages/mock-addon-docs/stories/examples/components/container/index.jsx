import PropTypes from "prop-types";
import React from "react";
import { containerStyles } from "./styles";

export const Container = ({ title, children }) => (
  <div style={containerStyles}>
    <h2>{title}</h2>
    {children}
  </div>
);

Container.propTypes = {
  title: PropTypes.string,
  children: PropTypes.node,
};
